import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getServicosRecorrentes,
  updateDiaVencimentoRecorrente,
  cancelarServicoRecorrente,
  excluirServicoRecorrente,
} from "@/services/supabaseApi";
import type { ServicoRecorrente } from "@/types";

type Serie = ServicoRecorrente & { cliente_nome?: string };

export function ServicosRecorrentesList({ refreshKey }: { refreshKey?: number }) {
  const { toast } = useToast();
  const [series, setSeries] = useState<Serie[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [novoDia, setNovoDia] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await getServicosRecorrentes();
    setSeries(data);
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function salvarDia(id: string) {
    if (!novoDia || novoDia < 1 || novoDia > 31) {
      toast({ title: "Dia inválido", description: "Informe um dia entre 1 e 31.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await updateDiaVencimentoRecorrente(id, novoDia);
      toast({ title: "Dia de vencimento atualizado", description: `${res.atualizadas} cobranças futuras ajustadas.` });
      setEditId(null);
      setNovoDia(undefined);
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function cancelarTodos(id: string) {
    if (!window.confirm("Cancelar todos os atendimentos futuros desta série? As cobranças pendentes futuras serão removidas.")) return;
    setBusy(true);
    try {
      await cancelarServicoRecorrente(id);
      toast({ title: "Série cancelada" });
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function excluir(id: string) {
    if (!window.confirm("Excluir esta série? Essa ação não pode ser desfeita.")) return;
    setBusy(true);
    try {
      await excluirServicoRecorrente(id);
      toast({ title: "Série excluída" });
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (series.length === 0) {
    return <div className="text-sm text-muted-foreground">Nenhum serviço recorrente cadastrado.</div>;
  }

  return (
    <div className="space-y-3">
      {series.map((s) => (
        <Card key={s.id} className="bg-white border-blue-200">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-blue-900">{s.cliente_nome || "Cliente"}</span>
                <Badge className={s.status === "ativo" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}>
                  {s.status}
                </Badge>
              </div>
              <div className="text-xs text-slate-600">
                {s.tipo_servico || "Serviço"} · vencimento dia {s.dia_vencimento} ·{" "}
                R$ {Number(s.valor_mensalidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ·{" "}
                {s.num_mensalidades} mensalidades
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {editId === s.id ? (
                <>
                  <Input
                    type="number" min={1} max={31}
                    value={novoDia ?? ""}
                    onChange={(e) => setNovoDia(e.target.value === "" ? undefined : parseInt(e.target.value))}
                    className="w-20"
                    placeholder="Dia"
                  />
                  <Button size="sm" disabled={busy} onClick={() => salvarDia(s.id)} className="bg-blue-600 text-white">
                    Salvar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditId(null); setNovoDia(undefined); }}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm" variant="outline"
                    className="border-blue-300 text-blue-700"
                    disabled={s.status !== "ativo"}
                    onClick={() => { setEditId(s.id); setNovoDia(s.dia_vencimento); }}
                  >
                    Editar dia
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="border-red-300 text-red-700"
                    disabled={s.status !== "ativo" || busy}
                    onClick={() => cancelarTodos(s.id)}
                  >
                    Cancelar todos
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="border-red-300 text-red-700"
                    disabled={busy}
                    onClick={() => excluir(s.id)}
                  >
                    <Trash2 size={14} className="mr-1" />
                    Excluir
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
