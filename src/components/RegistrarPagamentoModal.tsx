import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DollarSign, X, History, CreditCard, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";

type Cobranca = {
  id: string;
  valor: number;
  data_vencimento: string;
  status: string | null;
};

type Pagamento = {
  id: string;
  cobranca_id: string;
  data_pagamento: string | null;
  valor_pago: number | null;
  forma_pagamento: string | null;
  observacoes: string | null;
  created_at: string;
};

type NovoPagamentoForm = {
  valorPago: number | undefined;
  formaPagamento: string;
  dataPagamento: string;
  observacoes: string;
};

const FORM_INITIAL: NovoPagamentoForm = {
  valorPago: undefined,
  formaPagamento: "",
  dataPagamento: new Date().toISOString().split("T")[0],
  observacoes: "",
};

function getCobrancaStatusColor(status: string | null) {
  switch (status) {
    case "pago": return "bg-green-100 text-green-800";
    case "parcial": return "bg-yellow-100 text-yellow-800";
    case "pendente": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-700";
  }
}

function formatMoney(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

type Props = {
  cobrancaId: string;
  clienteNome: string;
  onClose: () => void;
  onChanged: () => void;
};

export function RegistrarPagamentoModal({ cobrancaId, clienteNome, onClose, onChanged }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [cobranca, setCobranca] = useState<Cobranca | null>(null);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [form, setForm] = useState<NovoPagamentoForm>(FORM_INITIAL);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;

    const { data: cobrancaData } = await supabase
      .from("cobrancas")
      .select("id, valor, data_vencimento, status")
      .eq("id", cobrancaId)
      .eq("user_id", userId)
      .maybeSingle();

    const { data: pagamentosData } = await supabase
      .from("pagamentos")
      .select("id, cobranca_id, data_pagamento, valor_pago, forma_pagamento, observacoes, created_at")
      .eq("cobranca_id", cobrancaId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    setCobranca(cobrancaData ?? null);
    setPagamentos(pagamentosData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    setForm(FORM_INITIAL);
  }, [cobrancaId]);

  const totalPago = pagamentos.reduce((s, p) => s + (p.valor_pago ?? 0), 0);
  const saldoDevedor = (cobranca?.valor ?? 0) - totalPago;
  const quitada = !!cobranca && saldoDevedor <= 0.001;

  async function handleRegistrar() {
    if (!cobranca) return;
    if (!form.valorPago || form.valorPago <= 0) {
      toast({ title: "Informe um valor válido.", variant: "destructive" });
      return;
    }
    if (!form.formaPagamento) {
      toast({ title: "Informe a forma de pagamento.", variant: "destructive" });
      return;
    }
    if (form.valorPago > saldoDevedor + 0.001) {
      toast({
        title: "Valor excede o saldo devedor.",
        description: `Saldo restante: R$ ${saldoDevedor.toFixed(2).replace(".", ",")}`,
        variant: "destructive",
      });
      return;
    }

    setSalvando(true);
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;

    const { error } = await supabase.from("pagamentos").insert({
      user_id: userId,
      cobranca_id: cobranca.id,
      data_pagamento: form.dataPagamento,
      valor_pago: form.valorPago,
      forma_pagamento: form.formaPagamento,
      observacoes: form.observacoes || null,
    });

    if (error) {
      toast({ title: "Erro ao registrar pagamento", description: error.message, variant: "destructive" });
      setSalvando(false);
      return;
    }

    const novoTotalPago = totalPago + form.valorPago;
    const novoStatus = novoTotalPago >= cobranca.valor - 0.001 ? "pago" : "parcial";

    await supabase.from("cobrancas").update({ status: novoStatus }).eq("id", cobranca.id).eq("user_id", userId);

    toast({ title: "Pagamento registrado com sucesso!" });
    await carregar();
    onChanged();
    setSalvando(false);
  }

  async function handleRemover(pagamentoId: string) {
    if (!cobranca) return;
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;

    const { error } = await supabase.from("pagamentos").delete().eq("id", pagamentoId).eq("user_id", userId);
    if (error) {
      toast({ title: "Erro ao remover pagamento", description: error.message, variant: "destructive" });
      return;
    }

    const restantes = pagamentos.filter((p) => p.id !== pagamentoId);
    const novoTotal = restantes.reduce((s, p) => s + (p.valor_pago ?? 0), 0);
    const novoStatus = novoTotal <= 0 ? "pendente" : novoTotal >= cobranca.valor - 0.001 ? "pago" : "parcial";

    await supabase.from("cobrancas").update({ status: novoStatus }).eq("id", cobranca.id).eq("user_id", userId);

    toast({ title: "Pagamento removido." });
    await carregar();
    onChanged();
  }

  return (
    <Card className="border-l-4 border-l-emerald-500 shadow-lg mb-8">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-white border-b border-emerald-200">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-emerald-900 flex items-center gap-2">
              <DollarSign size={20} />
              Pagamentos — {clienteNome}
            </CardTitle>
            <p className="text-xs text-emerald-700 mt-1">Gerencie os pagamentos desta cobrança</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-500 hover:text-slate-800">
            <X size={18} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Carregando...</div>
        ) : !cobranca ? (
          <div className="text-center text-muted-foreground py-8">Cobrança não encontrada.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border bg-slate-50 p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Valor total</p>
                <p className="text-2xl font-bold text-slate-800">R$ {formatMoney(cobranca.valor)}</p>
              </div>
              <div className="rounded-lg border bg-green-50 p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total pago</p>
                <p className="text-2xl font-bold text-green-700">R$ {formatMoney(totalPago)}</p>
              </div>
              <div className={`rounded-lg border p-4 text-center ${quitada ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Saldo devedor</p>
                <p className={`text-2xl font-bold ${quitada ? "text-green-700" : "text-red-700"}`}>
                  R$ {formatMoney(Math.max(0, saldoDevedor))}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Badge className={getCobrancaStatusColor(cobranca.status)}>{cobranca.status ?? "pendente"}</Badge>
              <span className="text-muted-foreground">
                Vencimento: {cobranca.data_vencimento ? format(parseISO(cobranca.data_vencimento), "dd/MM/yyyy", { locale: ptBR }) : "—"}
              </span>
            </div>

            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 text-slate-700 mb-3">
                <History size={16} />
                Histórico de pagamentos
              </h3>
              {pagamentos.length === 0 ? (
                <div className="text-sm text-muted-foreground bg-slate-50 rounded-lg border px-4 py-6 text-center">
                  Nenhum pagamento registrado ainda.
                </div>
              ) : (
                <div className="space-y-2">
                  {pagamentos.map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}.</span>
                        <div>
                          <div className="font-medium text-green-700">R$ {formatMoney(p.valor_pago ?? 0)}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.data_pagamento ? format(parseISO(p.data_pagamento), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                            {p.forma_pagamento ? ` · ${p.forma_pagamento}` : ""}
                            {p.observacoes ? ` · ${p.observacoes}` : ""}
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2" onClick={() => handleRemover(p.id)}>
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!quitada && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-emerald-800">
                  <CreditCard size={16} />
                  Registrar pagamento
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Valor (R$): <span className="text-red-500">*</span></Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={form.valorPago ?? ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, valorPago: e.target.value === "" ? undefined : parseFloat(e.target.value) }))}
                      placeholder={`Máx: R$ ${formatMoney(Math.max(0, saldoDevedor))}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Forma de pagamento: <span className="text-red-500">*</span></Label>
                    <Input
                      value={form.formaPagamento}
                      onChange={(e) => setForm((prev) => ({ ...prev, formaPagamento: e.target.value }))}
                      placeholder="Ex.: Pix, Dinheiro"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Data do pagamento:</Label>
                    <Input
                      type="date"
                      value={form.dataPagamento}
                      onChange={(e) => setForm((prev) => ({ ...prev, dataPagamento: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Observações:</Label>
                    <Input
                      value={form.observacoes}
                      onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="button" disabled={salvando} onClick={handleRegistrar} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {salvando ? "Salvando..." : "Registrar pagamento"}
                  </Button>
                </div>
              </div>
            )}

            {quitada && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
                <CheckCircle2 size={16} />
                Cobrança quitada — todos os pagamentos foram registrados.
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={onClose}>Fechar</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
