import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { usePredio } from '../contexts/PredioContext';
import { useUI } from '../contexts/UIContext';
import { usePontosEmprestimo } from '../hooks/useEmprestimos';
import { lerResposta } from '../utils/api';
import { baixarCsv } from '../utils/csv';
import { formatarDuracao } from '../../backend_core/utils/emprestimoRegras';
import {
    montarRelatorio, periodoPredefinido, periodoAtivo, PERIODOS_PREDEFINIDOS, descreverPeriodo,
    formatarDataHora, formatarNumero, formatarHoras, descreverRetirada, nomeArquivoRelatorio, linhasCsvRelatorio,
} from '../utils/relatorioEmprestimos';

// Relatório de empréstimos. Todas as contas vêm de montarRelatorio()
// (utils/relatorioEmprestimos.js), as mesmas do PDF e da planilha.
// ANÔNIMO: sem nome nem matrícula de aluno (dados confidenciais).

const LIMITE_REGISTROS_TELA = 15;
const estiloTooltip = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' };

function BarrasHorizontais({ dados, cor, nome, formatar = (v) => formatarNumero(v) }) {
    if (!dados.length) return <div className="empty-st">Nenhum registro no período.</div>;
    return (
        <ResponsiveContainer width="100%" height={dados.length * 36 + 16}>
            <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 100, top: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="rotulo" type="category" width={190} tickLine={false} axisLine={false}
                    style={{ fontSize: '12px', fill: 'var(--text2)', fontWeight: 600 }} />
                <Tooltip contentStyle={estiloTooltip} cursor={{ fill: 'var(--panel2)' }} formatter={(v) => [formatar(v), nome]} />
                <Bar dataKey="valor" name={nome} fill={cor} radius={[0, 4, 4, 0]} maxBarSize={22} minPointSize={2}>
                    <LabelList dataKey="valor" position="right" formatter={formatar} style={{ fill: 'var(--text)', fontSize: 12, fontWeight: 700 }} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function MapaCalor({ mapa }) {
    return (
        <div className="rel-calor" style={{ gridTemplateColumns: `44px repeat(${mapa.horas.length}, minmax(0, 1fr))` }}>
            <span />
            {mapa.horas.map(h => <span key={h} className="rel-calor-hora">{String(h).padStart(2, '0')}h</span>)}
            {mapa.dias.map(d => (
                <React.Fragment key={d.dia}>
                    <span className="rel-calor-dia">{d.dia}</span>
                    {d.valores.map((v, i) => {
                        const t = mapa.maximo ? v / mapa.maximo : 0;
                        return (
                            <span key={mapa.horas[i]} className="rel-calor-celula"
                                title={`${d.dia}, ${String(mapa.horas[i]).padStart(2, '0')}h: ${v} retirada${v === 1 ? '' : 's'}`}
                                style={v ? {
                                    background: `color-mix(in srgb, var(--blue) ${Math.round(15 + 85 * t)}%, var(--panel))`,
                                    color: t > 0.5 ? '#fff' : 'var(--text)',
                                } : undefined}>
                                {v || ''}
                            </span>
                        );
                    })}
                </React.Fragment>
            ))}
        </div>
    );
}

function Kpi({ titulo, valor, sub, cor }) {
    return (
        <div className="kpi-card">
            <span className="kpi-titulo">{titulo}</span>
            <div className={`kpi-valor ${cor}`}>{valor}</div>
            {sub && <span className="kpi-sub">{sub}</span>}
        </div>
    );
}

const TAG_SITUACAO = { aberto: 'pendente', nao_devolvido: 'perdido', problema: 'problema', devolvido: 'concluido' };

export default function RelatoriosEmprestimos({ session, acesso }) {
    const { predioAtivo, predioNome: predioNomeContexto } = usePredio();
    const { toast } = useUI();
    const currentPredioId = predioAtivo || acesso?.predioId || acesso?.predio_id;
    const predioNome = predioNomeContexto || acesso?.predioNome || '';

    // Período aplicado × o que está nos campos (datas digitadas valem no "Atualizar";
    // atalhos de período e ponto valem na hora)
    const [filtro, setFiltro] = useState(() => periodoPredefinido('hoje'));
    const [rascunho, setRascunho] = useState(filtro);
    const [pontoFiltro, setPontoFiltro] = useState('');
    const [verTodos, setVerTodos] = useState(false);
    const [gerandoPdf, setGerandoPdf] = useState(false);

    // Pontos que este login vê no relatório; o filtro só aparece com mais de um
    const { pontos } = usePontosEmprestimo(session, currentPredioId, 'relatorio');
    const pontoNome = pontoFiltro
        ? (pontos.find(p => p.id === pontoFiltro)?.nome || '')
        : (pontos.length === 1 ? pontos[0].nome : 'Todos os pontos');

    const { data: dados, isLoading, isError, error, isFetching } = useQuery({
        queryKey: ['relatorio_emprestimos', currentPredioId, filtro.inicio, filtro.fim, pontoFiltro],
        queryFn: async () => {
            const params = new URLSearchParams({ inicio: filtro.inicio, fim: filtro.fim, ...(pontoFiltro ? { ponto: pontoFiltro } : {}) });
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/relatorio?${params}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}`, 'x-predio-id': currentPredioId },
            });
            return lerResposta(res);
        },
        enabled: !!currentPredioId,
        staleTime: 1000 * 60 * 2,
    });

    const rel = useMemo(() => (dados ? montarRelatorio(dados, filtro) : null), [dados, filtro]);

    const aplicar = (periodo) => {
        if (periodo.inicio > periodo.fim) {
            toast.error('O início do período precisa ser antes do fim.');
            return;
        }
        setFiltro(periodo);
        setRascunho(periodo);
        setVerTodos(false);
    };
    const handleAtualizar = (e) => {
        e.preventDefault();
        if (!rascunho.inicio || !rascunho.fim) return;
        aplicar(rascunho);
    };
    const atalhoAtivo = periodoAtivo(filtro.inicio, filtro.fim);
    const rascunhoPendente = rascunho.inicio !== filtro.inicio || rascunho.fim !== filtro.fim;

    const arquivo = (extensao) => nomeArquivoRelatorio({
        predioNome, pontoNome: pontoFiltro ? pontoNome : '', inicio: filtro.inicio, fim: filtro.fim, extensao,
    });
    const exportarPdf = async () => {
        if (!rel) return;
        setGerandoPdf(true);
        try {
            // jsPDF só carrega quando alguém exporta
            const { gerarPdfRelatorio } = await import('../utils/pdfRelatorioEmprestimos');
            const pdf = gerarPdfRelatorio(rel, { predioNome, pontoNome, geradoEm: new Date(), geradoPor: session?.user?.email || '' });
            pdf.save(arquivo('pdf'));
        } catch (err) {
            console.error(err);
            toast.error('Não foi possível gerar o PDF.');
        } finally {
            setGerandoPdf(false);
        }
    };
    const exportarPlanilha = () => {
        if (rel) baixarCsv(arquivo('csv'), linhasCsvRelatorio(rel));
    };

    const r = rel?.resumo;
    const total = r?.retiradas || 1;
    const comPct = (v) => `${formatarNumero(v)} (${formatarNumero((v / total) * 100)}%)`;
    const registros = rel ? (verTodos ? rel.registros : rel.registros.slice(0, LIMITE_REGISTROS_TELA)) : [];

    return (
        <div className="relatorios-container">
            <div className="relatorios-header">
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text)', display: 'flex', alignItems: 'center' }}>
                        Relatório de Empréstimos
                        {isFetching && <span className="badge-atualizando">Atualizando...</span>}
                    </h2>
                    <p className="rel-filtro-aplicado">
                        {[predioNome, pontoNome].filter(Boolean).join(' · ')} · <strong>{descreverPeriodo(filtro.inicio, filtro.fim)}</strong>
                    </p>
                </div>

                <form className="filtros-wrapper" onSubmit={handleAtualizar}>
                    {pontos.length > 1 && (
                        <div className="input-filtro-box">
                            <label>PONTO</label>
                            <select value={pontoFiltro} onChange={e => { setPontoFiltro(e.target.value); setVerTodos(false); }} className="input-filtro">
                                <option value="">Todos os pontos</option>
                                {pontos.map(p => <option key={p.id} value={p.id}>{p.nome}{!p.ativo ? ' (inativo)' : ''}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="input-filtro-box">
                        <label>INÍCIO</label>
                        <input type="datetime-local" value={rascunho.inicio} onChange={e => setRascunho(v => ({ ...v, inicio: e.target.value }))} className="input-filtro" />
                    </div>
                    <div className="input-filtro-box">
                        <label>FIM</label>
                        <input type="datetime-local" value={rascunho.fim} onChange={e => setRascunho(v => ({ ...v, fim: e.target.value }))} className="input-filtro" />
                    </div>
                    <button type="submit" disabled={isFetching} className={`btn-atualizar-filtro${rascunhoPendente ? ' pendente' : ''}`}>
                        Atualizar
                    </button>
                </form>
            </div>

            <div className="rel-barra">
                <div className="rel-periodos">
                    {PERIODOS_PREDEFINIDOS.map(p => (
                        <button key={p.chave} type="button" className={`rel-periodo${atalhoAtivo === p.chave ? ' ativo' : ''}`}
                            onClick={() => aplicar(periodoPredefinido(p.chave))}>
                            {p.rotulo}
                        </button>
                    ))}
                </div>
                <div className="rel-exportar">
                    <button type="button" className="btn-exportar-pdf" onClick={exportarPlanilha} disabled={!rel || isFetching}
                        title="Planilha com todas as retiradas do período (abre no Excel)">
                        📊 Exportar planilha
                    </button>
                    <button type="button" className="btn-exportar-pdf" onClick={exportarPdf} disabled={!rel || isFetching || gerandoPdf}
                        title="Relatório em PDF com o período e os gráficos">
                        {gerandoPdf ? '⏳ Gerando...' : '📄 Exportar PDF'}
                    </button>
                </div>
            </div>

            {isError ? (
                <div className="empty-st" style={{ color: 'var(--red)' }}>{error?.message || 'Erro ao carregar o relatório. Tente novamente.'}</div>
            ) : (isLoading || !rel) ? (
                <div className="empty-st">Analisando os dados do período...</div>
            ) : (
                <>
                    <div className="kpi-grid">
                        <Kpi titulo="RETIRADAS NO PERÍODO" valor={formatarNumero(r.retiradas)} cor="blue"
                            sub={r.pico ? `pico: ${r.pico}` : null} />
                        <Kpi titulo="ALUNOS ÚNICOS" valor={formatarNumero(r.alunos)} cor="green"
                            sub={`${formatarNumero(r.alunosRecorrentes)} voltaram mais de uma vez`} />
                        <Kpi titulo="MÉDIA POR ALUNO" valor={formatarNumero(r.mediaPorAluno, 1)} cor="purple" sub="retiradas por aluno" />
                        <Kpi titulo="TEMPO TÍPICO DE USO" valor={r.duracaoMediana == null ? '--' : formatarDuracao(Math.round(r.duracaoMediana))} cor="amber"
                            sub={`mediana · ${formatarHoras(r.minutosTotais)} somadas`} />
                        <Kpi titulo="DEVOLVIDOS COM PROBLEMA" valor={formatarNumero(r.comProblema)} cor={r.comProblema ? 'red' : 'muted'}
                            sub="item foi para manutenção" />
                        <Kpi titulo="ITENS USADOS" valor={`${formatarNumero(r.itensUsados)} de ${formatarNumero(r.itensNoAcervo)}`} cor="navy"
                            sub="do acervo saíram no período" />
                    </div>

                    {r.retiradas === 0 ? (
                        <div className="empty-st">Nenhuma retirada registrada neste período.</div>
                    ) : (
                        <>
                            <div className="chart-box">
                                <h3 className="chart-title">📅 {rel.serie.titulo}</h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={rel.serie.barras} margin={{ top: 20, right: 10, left: -10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="rotulo" style={{ fontSize: '12px', fill: 'var(--text2)' }} interval="preserveStartEnd" minTickGap={8} />
                                        <YAxis allowDecimals={false} style={{ fontSize: '12px', fill: 'var(--muted)' }} />
                                        <Tooltip contentStyle={estiloTooltip} cursor={{ fill: 'var(--panel2)' }}
                                            labelFormatter={(_, p) => p?.[0]?.payload?.rotuloLongo || ''} />
                                        <Bar dataKey="quantidade" name="Retiradas" fill="var(--blue)" radius={[4, 4, 0, 0]} maxBarSize={48}>
                                            {rel.serie.barras.length <= 31 && (
                                                <LabelList dataKey="quantidade" position="top" formatter={(v) => (v ? v : '')}
                                                    style={{ fill: 'var(--text2)', fontSize: 11, fontWeight: 700 }} />
                                            )}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            <div className={rel.variosPontos ? 'charts-grid' : ''}>
                                {rel.variosPontos && (
                                    <div className="chart-box">
                                        <h3 className="chart-title">📍 Retiradas por ponto de empréstimo</h3>
                                        <BarrasHorizontais nome="Retiradas" cor="var(--purple)" formatar={comPct}
                                            dados={rel.porPonto.map(p => ({ rotulo: p.nome, valor: p.quantidade }))} />
                                    </div>
                                )}
                                <div className="chart-box">
                                    <h3 className="chart-title">🗂️ Retiradas por categoria</h3>
                                    <BarrasHorizontais nome="Retiradas" cor="var(--purple)" formatar={comPct}
                                        dados={rel.porCategoria.map(c => ({ rotulo: c.nome, valor: c.quantidade }))} />
                                </div>
                            </div>

                            <div className="charts-grid">
                                <div className="chart-box">
                                    <h3 className="chart-title">🏆 Itens mais retirados <span className="chart-sub">top 10, vezes</span></h3>
                                    <BarrasHorizontais nome="Retiradas" cor="var(--blue)"
                                        dados={rel.itensMaisRetirados.map(i => ({ rotulo: i.nome, valor: i.quantidade }))} />
                                </div>
                                <div className="chart-box">
                                    <h3 className="chart-title">⏳ Itens com maior tempo de uso <span className="chart-sub">top 10, horas somadas</span></h3>
                                    <BarrasHorizontais nome="Tempo de uso" cor="var(--amber)" formatar={formatarHoras}
                                        dados={rel.itensMaisTempo.map(i => ({ rotulo: i.nome, valor: i.minutos }))} />
                                </div>
                            </div>

                            <div className="chart-box">
                                <h3 className="chart-title">⏰ Retiradas por dia da semana e horário {r.pico && <span className="chart-sub">pico: {r.pico}</span>}</h3>
                                <MapaCalor mapa={rel.mapaCalor} />
                            </div>

                            <div className="charts-grid">
                                <div className="chart-box">
                                    <h3 className="chart-title">⌛ Tempo de uso <span className="chart-sub">{formatarNumero(r.devolvidas)} devoluções</span></h3>
                                    <BarrasHorizontais nome="Devoluções" cor="var(--green)"
                                        dados={r.devolvidas ? rel.faixasDuracao.map(f => ({ rotulo: f.rotulo, valor: f.quantidade })) : []} />
                                </div>
                                <div className="chart-box">
                                    <h3 className="chart-title">👥 Frequência dos alunos <span className="chart-sub">quantas vezes cada um retirou</span></h3>
                                    <BarrasHorizontais nome="Alunos" cor="var(--purple)" formatar={(v) => `${formatarNumero(v)} aluno${v === 1 ? '' : 's'}`}
                                        dados={rel.frequenciaAlunos.map(f => ({ rotulo: f.rotulo, valor: f.quantidade }))} />
                                </div>
                            </div>

                            {r.itensNoAcervo > 0 && (
                                <div className="chart-box">
                                    <h3 className="chart-title">💤 Itens sem nenhuma retirada no período <span className="chart-sub">{rel.itensSemUso.length} de {r.itensNoAcervo} do acervo</span></h3>
                                    {rel.itensSemUso.length === 0 ? (
                                        <div className="empty-st" style={{ padding: 8 }}>Todos os itens do acervo saíram pelo menos uma vez.</div>
                                    ) : (
                                        <div className="rel-chips">
                                            {rel.itensSemUso.map(i => (
                                                <span key={i.id} className="rel-chip">{i.nome} <small>{i.categoria}{rel.variosPontos ? ` · ${i.ponto}` : ''}</small></span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="chart-box" style={{ display: 'flex', flexDirection: 'column' }}>
                                <h3 className="chart-title">📄 Registro de retiradas <span className="chart-sub">{formatarNumero(r.retiradas)} no período, da mais recente para a mais antiga</span></h3>
                                <div className="table-wrapper" style={{ maxHeight: 'none', overflowY: 'visible' }}>
                                    <table className="table-historico">
                                        <thead style={{ background: 'var(--panel2)' }}>
                                            <tr>
                                                <th>Retirada</th>
                                                <th>Devolução</th>
                                                <th>Item</th>
                                                {rel.variosPontos && <th>Ponto</th>}
                                                <th>Categoria</th>
                                                <th>Duração</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {registros.map((reg, n) => (
                                                <tr key={`${reg.retirada}-${reg.itemId}-${n}`}>
                                                    <td className="rel-td-data">{formatarDataHora(reg.retirada)}</td>
                                                    <td className="rel-td-data">{reg.devolucao ? formatarDataHora(reg.devolucao) : '--'}</td>
                                                    <td className="th-item">{reg.item}</td>
                                                    {rel.variosPontos && <td>{reg.ponto}</td>}
                                                    <td>{reg.categoria}</td>
                                                    <td>
                                                        <span className={`tag-status ${TAG_SITUACAO[reg.situacao]}`}>{descreverRetirada(reg)}</span>
                                                        {reg.situacao === 'problema' && <span className="tag-status problema" style={{ marginLeft: 4 }}>Com problema</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {rel.registros.length > LIMITE_REGISTROS_TELA && (
                                        <button type="button" className="btn-ver-mais" onClick={() => setVerTodos(v => !v)}>
                                            {verTodos ? 'Ver menos ▲' : `Ver todas as ${formatarNumero(rel.registros.length)} retiradas ▼`}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
