import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Edit, Users, Trash2 } from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";
import { Cliente } from "@/types";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { getClientesApi } from "@/services/supabaseApi";

export default function Clientes() {
  const { clientes, addCliente, updateCliente, removeCliente, refreshClientes } = useAppContext() as any;
  const [editingClienteId, setEditingClienteId] = useState<string | null>(null);
  const [deletingCliente, setDeletingCliente] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<any>({
      nome: "",
        sobrenome: "",
        numeroCelular: "",
        numeroTelefone: "",
        email: "",
        endereco: "",
        cidade: "",
        observacoes: "",
        piscinaTipo: "",
        piscinaTamanho: "",
        piscinaEndereco: "",
        piscinaObservacoes: "",
        piscinaSameAddress: true,
      });
  const { toast } = useToast();
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'view' | 'edit'>('list');

  const formRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showForm && formRef.current) {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [showForm]);

  useEffect(() => {
    if (selectedCliente && detailRef.current) {
      setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [selectedCliente]);

  const handleViewClick = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setViewMode('view');
  };

  const handleBackFromView = () => {
    setSelectedCliente(null);
    setViewMode('list');
  };

  const handleDeleteCliente = async () => {
    if (!selectedCliente) return;
    const nomeCompleto = `${selectedCliente.nome} ${selectedCliente.sobrenome}`;
    if (
      !window.confirm(
        `Excluir o cliente ${nomeCompleto}? Isso também apaga piscinas, histórico de serviços e cobranças já pagas deste cliente. Essa ação não pode ser desfeita.`
      )
    )
      return;

    setDeletingCliente(true);
    try {
      await removeCliente(selectedCliente.id as string);
      toast({ title: "Cliente excluído." });
      handleBackFromView();
    } catch (err: any) {
      toast({ title: "Erro ao excluir cliente", description: err.message, variant: "destructive" });
    } finally {
      setDeletingCliente(false);
    }
  };

  const handleEditFromView = () => {
    if (!selectedCliente) return;
    const piscina = (selectedCliente as any).piscina || null;
    const piscinaEndereco = piscina ? piscina.endereco ?? "" : "";
    const sameAddress = piscina ? (piscinaEndereco === (selectedCliente as any).endereco || piscinaEndereco === "") : true;

    setFormData({
      nome: selectedCliente.nome || "",
      sobrenome: selectedCliente.sobrenome || "",
      numeroCelular: (selectedCliente as any).numero_celular || (selectedCliente as any).numeroCelular || (selectedCliente as any).numero_telefone || (selectedCliente as any).numeroTelefone || (selectedCliente as any).telefone || "",
      numeroTelefone: (selectedCliente as any).numero_telefone || (selectedCliente as any).numeroTelefone || "",
      email: selectedCliente.email || "",
      endereco: selectedCliente.endereco || "",
      cidade: selectedCliente.cidade || "",
      observacoes: (selectedCliente as any).observacoes || "",
      piscinaTipo: piscina ? piscina.tipo ?? "" : "",
      piscinaTamanho: piscina ? piscina.tamanho ?? "" : "",
      piscinaEndereco: sameAddress ? selectedCliente.endereco || "" : piscinaEndereco,
      piscinaObservacoes: piscina ? piscina.observacoes ?? "" : "",
      piscinaSameAddress: sameAddress,
    });
    setEditingClienteId(selectedCliente.id as string);
    setShowForm(true);
    setViewMode('edit');
  };

  const resetForm = () => {
    setFormData({
      nome: "",
      sobrenome: "",
      numeroCelular: "",
      numeroTelefone: "",
      email: "",
      endereco: "",
      cidade: "",
      observacoes: "",
      piscinaTipo: "",
      piscinaTamanho: "",
      piscinaEndereco: "",
      piscinaObservacoes: "",
      piscinaSameAddress: true,
    });
  };

  // --- helpers de validação ---
  const limparNaoNumericos = (valor: string) => valor.replace(/\D/g, "");

  const validarCPF = (cpfRaw: string) => {
    const cpf = limparNaoNumericos(cpfRaw);
    // aqui só valida tamanho; regra de dígitos verificadores pode ser adicionada depois
    return cpf.length === 11;
  };

  // telefones aceitos:
  // - 55 51 98888-8888  -> 13 dígitos numéricos (55 + DDD + 9 + número)
  // - 51 98888-8888     -> 11 dígitos numéricos (DDD + 9 + número)
  const validarTelefone = (telefoneRaw: string) => {
    const tel = limparNaoNumericos(telefoneRaw);
    return tel.length === 11 || tel.length === 13;
  };

  const filteredClientes = clientes.filter(cliente =>
    (cliente.nome ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    ((cliente as any).sobrenome ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    ((cliente as any).email ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome || !formData.sobrenome || !formData.numeroCelular || !formData.email || !formData.cidade || !formData.endereco) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Nome, sobrenome, número celular, email, cidade e endereço são obrigatórios.",
        variant: "destructive",
      });
      return;
    }



    // valida piscina (se preenchida)
    if (formData.piscinaTamanho && formData.piscinaTamanho.trim().length === 0) {
      toast({ title: "Piscina: tamanho obrigatório", variant: "destructive" });
      return;
    }

    // montar payload para criar/atualizar cliente + piscina
    const payload: any = { ...formData };
    payload.piscina = {
      tipo: formData.piscinaTipo || null,
      tamanho: formData.piscinaTamanho || null,
      endereco: formData.piscinaSameAddress ? formData.endereco : formData.piscinaEndereco,
      observacoes: formData.piscinaObservacoes || null,
    };

    if (editingClienteId) {
      const atualizado = await updateCliente(editingClienteId, payload as any);
      if (atualizado) {
        toast({ title: "Cadastro atualizado com sucesso" });
      // garantir que piscina esteja carregada: recarregar clientes e buscar cliente atualizado
      try {
        await refreshClientes();
        const all = await getClientesApi();
        const refreshed = all.find((c) => c.id === editingClienteId) || atualizado;
        setSelectedCliente(refreshed);
        setViewMode('view');
      } catch (e) {
        console.error("Erro ao recuperar cliente atualizado:", e);
        setSelectedCliente(atualizado);
        setViewMode('view');
      }
    } else {
      toast({ title: "Erro ao atualizar cliente", variant: "destructive" });
    }
    } else {
    const novo = await addCliente(payload as any);
    if (novo) {
      toast({ title: "Cliente cadastrado com sucesso" });
      try {
        await refreshClientes();
        const all = await getClientesApi();
        const refreshed = all.find((c) => c.id === novo.id) || novo;
        setSelectedCliente(refreshed);
        setViewMode('view');
      } catch (e) {
        console.error("Erro ao recuperar cliente criado:", e);
        setSelectedCliente(novo);
        setViewMode('view');
      }
    } else {
      toast({ title: "Erro ao cadastrar cliente", variant: "destructive" });
    }
    }

    // reset e navegação de tela
    setFormData({
      nome: "",
      sobrenome: "",
      numeroCelular: "",
      numeroTelefone: "",
      email: "",
      endereco: "",
      cidade: "",
      observacoes: "",
      piscinaTipo: "",
      piscinaTamanho: "",
      piscinaEndereco: "",
      piscinaObservacoes: "",
      piscinaSameAddress: true,
    });
    setShowForm(false);
    setEditingClienteId(null);
    setViewMode("list");
    setSelectedCliente(null);
  };

  const handleEditClick = (cliente: Cliente) => {
    const piscina = (cliente as any).piscina || null;
    const piscinaEndereco = piscina ? piscina.endereco ?? "" : "";
    const sameAddress = piscina ? (piscinaEndereco === (cliente as any).endereco || piscinaEndereco === "" ) : true;

    setFormData({
      nome: cliente.nome || "",
      sobrenome: cliente.sobrenome || "",
      numeroCelular: (cliente as any).numero_celular || (cliente as any).numeroCelular || (cliente as any).numero_telefone || (cliente as any).numeroTelefone || (cliente as any).telefone || "",
      numeroTelefone: (cliente as any).numero_telefone || (cliente as any).numeroTelefone || "",
      email: cliente.email || "",
      endereco: cliente.endereco || "",
      cidade: cliente.cidade || "",
      observacoes: (cliente as any).observacoes || "",
      piscinaTipo: piscina ? piscina.tipo ?? "" : "",
      piscinaTamanho: piscina ? piscina.tamanho ?? "" : "",
      piscinaEndereco: sameAddress ? cliente.endereco || "" : piscinaEndereco,
      piscinaObservacoes: piscina ? piscina.observacoes ?? "" : "",
      piscinaSameAddress: sameAddress,
    });
    setEditingClienteId(cliente.id as string);
    setShowForm(true);
  };

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground">Clientes</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie todos os seus clientes
        </p>
      </div>

      {/* Botão de ação */}
      <div className="flex gap-3 mb-8">
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 flex items-center gap-2"
          onClick={() => {
            if (showForm && !editingClienteId) {
              resetForm();
            }
            setShowForm(prev => !prev);
          }}
        >
          <Plus size={18} />
          {showForm ? "Cancelar" : editingClienteId ? "Editar Cliente" : "Cadastrar Cliente"}
        </Button>
      </div>

      {/* Pesquisa */}
      {!showForm && (
        <Card className="mb-6 bg-white border-blue-200">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                placeholder="Pesquisar cliente por nome ou email"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* FORMULÁRIO */}
      {showForm && (
              <div ref={formRef}>
                <Card className="mb-8 border-l-4 border-l-blue-600 shadow-lg">
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
                    <CardTitle className="flex items-center gap-2 text-blue-900">
                      <Users size={20} />
                      {editingClienteId ? "Editar Cliente" : "Cadastrar Novo Cliente"}
                    </CardTitle>
                    <p className="text-xs text-blue-700 mt-1">Preencha os dados do cliente</p>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="nome">Nome: <span className="text-red-500">*</span></Label>
                          <Input
                            id="nome"
                            required
                            value={formData.nome}
                            onChange={(e) => handleInputChange("nome", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="sobrenome">Sobrenome:</Label>
                          <Input
                            id="sobrenome"
                            value={formData.sobrenome}
                            onChange={(e) => handleInputChange("sobrenome", e.target.value)}
                            placeholder="Sobrenome"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="email">E-mail:</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange("email", e.target.value)}
                        />
                      </div>

                      <div>
                        <Label htmlFor="numeroCelular">Número Celular: <span className="text-red-500">*</span></Label>
                        <Input
                          id="numeroCelular"
                          required
                          value={formData.numeroCelular}
                          onChange={(e) => handleInputChange("numeroCelular", e.target.value)}
                          placeholder="(11) 99999-9999"
                        />
                      </div>

                      <div>
                        <Label htmlFor="numeroTelefone">Número Telefone:</Label>
                        <Input
                          id="numeroTelefone"
                          value={formData.numeroTelefone}
                          onChange={(e) => handleInputChange("numeroTelefone", e.target.value)}
                          placeholder="(11) 3333-4444"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="endereco">Endereço:</Label>
                          <Input
                            id="endereco"
                            value={formData.endereco}
                            onChange={(e) => handleInputChange("endereco", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="cidade">Cidade:</Label>
                          <Input
                            id="cidade"
                            value={formData.cidade}
                            onChange={(e) => handleInputChange("cidade", e.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="observacoes">Observações do cliente:</Label>
                        <textarea
                          id="observacoes"
                          value={formData.observacoes}
                          onChange={(e) => handleInputChange("observacoes", e.target.value)}
                          className="w-full border rounded px-2 py-1"
                        />
                      </div>

                      <div className="p-4 border rounded bg-slate-50">
                        <h3 className="text-sm font-semibold mb-2">Piscina</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                          <div>
                            <Label htmlFor="piscinaTipo">Tipo</Label>
                            <Input
                              id="piscinaTipo"
                              value={formData.piscinaTipo}
                              onChange={(e) => handleInputChange("piscinaTipo", e.target.value)}
                              placeholder="Ex: azulejo, vinil, fibra"
                            />
                          </div>
                          <div>
                            <Label htmlFor="piscinaTamanho">Tamanho</Label>
                            <Input
                              id="piscinaTamanho"
                              value={formData.piscinaTamanho}
                              onChange={(e) => handleInputChange("piscinaTamanho", e.target.value)}
                              placeholder="Ex: 8x4, 10m"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <input
                            id="piscinaSameAddress"
                            type="checkbox"
                            checked={!!formData.piscinaSameAddress}
                            onChange={(e) => {
                              handleInputChange("piscinaSameAddress", e.target.checked);
                              if (e.target.checked) handleInputChange("piscinaEndereco", formData.endereco || "");
                            }}
                            className="w-4 h-4"
                          />
                          <Label htmlFor="piscinaSameAddress">Endereço da piscina é igual ao endereço do cliente</Label>
                        </div>

                        <div className="mb-3">
                          <Label htmlFor="piscinaEndereco">Endereço da piscina</Label>
                          <Input
                            id="piscinaEndereco"
                            value={formData.piscinaEndereco}
                            onChange={(e) => handleInputChange("piscinaEndereco", e.target.value)}
                            placeholder="Endereço da piscina"
                            disabled={!!formData.piscinaSameAddress}
                          />
                        </div>

                        <div className="mb-3">
                          <Label htmlFor="piscinaObservacoes">Observações da piscina</Label>
                          <textarea
                            id="piscinaObservacoes"
                            value={formData.piscinaObservacoes}
                            onChange={(e) => handleInputChange("piscinaObservacoes", e.target.value)}
                            className="w-full border rounded px-2 py-1"
                          />
                        </div>
                      </div>

                     

                      <div className="flex gap-2 pt-4">
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white flex-1">
                          {editingClienteId ? "Salvar Alterações" : "Salvar Cliente"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1"
                          onClick={async () => {
                            setEditingClienteId(null);
                            resetForm();
                            setShowForm(false);
                            setSelectedCliente(null);
                            setViewMode('list');
                            try {
                              await refreshClientes();
                            } catch (e) {
                              console.error("Erro ao recarregar clientes após cancelar:", e);
                            }
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
            )}

      {/* Client List */}
      {viewMode === 'list' && (
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Users size={24} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Clientes Cadastrados</h2>
            <span className="ml-auto text-sm text-muted-foreground">{filteredClientes.length} cliente(s)</span>
          </div>
          <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
            <CardContent className="pt-6">
              {filteredClientes.length === 0 ? (
                <div className="text-center py-12">
                  <Users size={48} className="mx-auto text-blue-200 mb-3" />
                  <p className="text-muted-foreground">
                    {searchTerm ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredClientes.map((cliente) => (
                    <Card
                      key={cliente.id}
                      className="bg-white border-blue-200 hover:shadow-lg transition cursor-pointer hover:border-blue-400"
                      onClick={() => handleViewClick(cliente)}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="font-bold text-base text-blue-800 flex-1">
                            {cliente.nome} {cliente.sobrenome}
                          </h4>
                        </div>
                        <div className="space-y-2 text-sm text-slate-600">
                          <div className="flex justify-between">
                            <span>📧 Email:</span>
                            <span className="font-medium text-xs">{cliente.email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>📱 Celular:</span>
                            <span className="font-medium">{cliente.numeroCelular}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>📍 Cidade:</span>
                            <span className="font-medium">{cliente.cidade}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mt-3 text-blue-700 hover:bg-blue-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewClick(cliente);
                          }}
                        >
                          <Edit size={16} className="mr-2" /> Ver Detalhes
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Visualizar Cliente */}
      {viewMode === 'view' && selectedCliente && (
        <div ref={detailRef}>
          <Card className="border-l-4 border-l-blue-600 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-white border-b border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <span>{selectedCliente.nome} {selectedCliente.sobrenome}</span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cliente desde{" "}
                    {format(parseISO(selectedCliente.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="font-medium">Contato principal</div>
                  <div>{selectedCliente.email}</div>
                  <div>{selectedCliente.numeroCelular}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-4 text-sm">
              {/* Linha de chips principais */}
              <div className="flex flex-wrap gap-2 text-xs">
                {selectedCliente.numeroTelefone && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <span className="font-medium">Telefone</span>
                    <span>{selectedCliente.numeroTelefone}</span>
                  </Badge>
                )}
              </div>

              {/* Seções em duas colunas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Dados pessoais
                  </h3>
                  <div className="rounded-lg border bg-slate-50/60 p-3 space-y-1">
                    <div>
                      <span className="font-medium text-foreground">Nome completo: </span>
                      <span>{selectedCliente.nome} {selectedCliente.sobrenome}</span>
                      <div>
                      <span className="font-medium text-foreground">Email: </span>
                      <span>{selectedCliente.email}</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Celular: </span>
                      <span>{selectedCliente.numeroCelular}</span>
                    </div>
                    {selectedCliente.numeroTelefone && (
                      <div>
                        <span className="font-medium text-foreground">Telefone: </span>
                        <span>{selectedCliente.numeroTelefone}</span>
                      </div>
                    )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Endereço
                  </h3>
                  <div className="rounded-lg border bg-slate-50/60 p-3 space-y-1">
                    <div>
                      <span className="font-medium text-foreground">Endereço: </span>
                      <span>{selectedCliente.endereco}</span>
                      {selectedCliente.complemento && (
                        <span className="text-muted-foreground"> {selectedCliente.complemento}</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Cidade/Estado: </span>
                      <span>{selectedCliente.cidade}, {selectedCliente.estado}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Piscina do cliente */}
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Piscina</h3>
                <div className="rounded-lg border bg-slate-50/60 p-3 space-y-1 text-sm">
                  {(selectedCliente as any).piscina ? (
                    <>
                      <div>
                        <span className="font-medium text-foreground">Tipo: </span>
                        <span>{(selectedCliente as any).piscina.tipo ?? "-"}</span>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Tamanho: </span>
                        <span>{(selectedCliente as any).piscina.tamanho ?? "-"}</span>
                      </div>
                      {(selectedCliente as any).piscina.endereco && (
                        <div>
                          <span className="font-medium text-foreground">Endereço: </span>
                          <span>{(selectedCliente as any).piscina.endereco}</span>
                        </div>
                      )}
                      {(selectedCliente as any).piscina.observacoes && (
                        <div>
                          <span className="font-medium text-foreground">Observações: </span>
                          <span>{(selectedCliente as any).piscina.observacoes}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">Nenhuma piscina cadastrada para este cliente.</div>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                 <Button onClick={handleBackFromView} variant="outline" className="w-full sm:w-auto px-4">
                   Voltar
                 </Button>
                 <Button
                   onClick={handleDeleteCliente}
                   disabled={deletingCliente}
                   variant="outline"
                   className="w-full sm:w-auto px-4 border-red-300 text-red-700 hover:bg-red-50"
                 >
                   <Trash2 size={16} className="mr-2" />
                   {deletingCliente ? "Excluindo..." : "Excluir cliente"}
                 </Button>
                 <Button
                   onClick={handleEditFromView}
                   className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-primary-foreground px-4"
                 >
                   Editar cadastro
                 </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}