/* Utilitários: dinheiro em centavos, datas no formato AAAA-MM-DD, IDs e texto seguro.
   Nenhuma função aqui usa número com casas decimais para guardar dinheiro. */
(function () {
  'use strict';

  const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  /* ---------- Dinheiro ---------- */

  // 123456 -> "R$ 1.234,56"
  function formatarMoeda(centavos) {
    if (!Number.isSafeInteger(centavos)) return '—';
    return formatoMoeda.format(centavos / 100);
  }

  // "1.234,56" | "1234,5" | "R$ 1.234" | "-10,00" -> centavos inteiros; texto inválido -> null
  function paraCentavos(texto) {
    if (typeof texto !== 'string') return null;
    let s = texto.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    let negativo = false;
    if (s.startsWith('-')) {
      negativo = true;
      s = s.slice(1);
    }
    const comMilhar = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/;
    const semMilhar = /^\d+(,\d{1,2})?$/;
    if (!comMilhar.test(s) && !semMilhar.test(s)) return null;
    const partes = s.replace(/\./g, '').split(',');
    const inteiro = parseInt(partes[0], 10);
    const decimais = parseInt(((partes[1] || '') + '00').slice(0, 2), 10);
    const centavos = inteiro * 100 + decimais;
    if (!Number.isSafeInteger(centavos)) return null;
    return negativo && centavos !== 0 ? -centavos : centavos;
  }

  // 12345 -> "123,45" (para preencher campos de formulário)
  function centavosParaCampo(centavos) {
    if (!Number.isSafeInteger(centavos)) return '';
    const negativo = centavos < 0;
    const abs = Math.abs(centavos);
    const inteiro = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimais = String(abs % 100).padStart(2, '0');
    return (negativo ? '-' : '') + inteiro + ',' + decimais;
  }

  /* ---------- Datas ---------- */

  function doisDigitos(n) {
    return String(n).padStart(2, '0');
  }

  function hojeISO() {
    const d = new Date();
    return d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate());
  }

  function mesAtual() {
    return hojeISO().slice(0, 7);
  }

  function ultimoDiaDoMes(ano, mes) {
    return new Date(ano, mes, 0).getDate();
  }

  function ehDataISO(texto) {
    if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
    const [a, m, d] = texto.split('-').map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= ultimoDiaDoMes(a, m);
  }

  function ehMesISO(texto) {
    if (typeof texto !== 'string' || !/^\d{4}-\d{2}$/.test(texto)) return false;
    const m = Number(texto.slice(5));
    return m >= 1 && m <= 12;
  }

  // "2026-11-10" -> "10/11/2026"
  function formatarData(iso) {
    if (!ehDataISO(iso)) return '';
    const [a, m, d] = iso.split('-');
    return d + '/' + m + '/' + a;
  }

  // "2026-11", -1 -> "2026-10"
  function somarMeses(mes, quantidade) {
    const [a, m] = mes.split('-').map(Number);
    const total = a * 12 + (m - 1) + quantidade;
    return Math.floor(total / 12) + '-' + doisDigitos((total % 12) + 1);
  }

  // "2026-11" -> "Novembro de 2026"
  function nomeMes(mes) {
    const [a, m] = mes.split('-').map(Number);
    const texto = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function agoraISO() {
    return new Date().toISOString();
  }

  function formatarISO(ano, mes, dia) {
    return String(ano).padStart(4, '0') + '-' + doisDigitos(mes) + '-' + doisDigitos(dia);
  }

  // Soma (ou subtrai) dias de uma data AAAA-MM-DD. Usa UTC para não sofrer com horário de verão.
  function somarDias(iso, quantidade) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d + quantidade)).toISOString().slice(0, 10);
  }

  // Soma meses mantendo o dia da data original; se o mês não tiver esse dia, usa o último.
  // Calcular sempre a partir da data original evita que o dia "derive" (31/01 -> 28/02 -> 28/03).
  function somarMesesDaData(iso, quantidade) {
    const [a, m, d] = iso.split('-').map(Number);
    const total = a * 12 + (m - 1) + quantidade;
    const ano = Math.floor(total / 12);
    const mes = (total % 12) + 1;
    return formatarISO(ano, mes, Math.min(d, ultimoDiaDoMes(ano, mes)));
  }

  // Quantos dias de uma data até a outra (negativo se a segunda for anterior).
  function diferencaDias(de, ate) {
    const [a1, m1, d1] = de.split('-').map(Number);
    const [a2, m2, d2] = ate.split('-').map(Number);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
  }

  // "2026-11" -> "2026-11-30"
  function ultimoDiaDaCompetencia(mes) {
    const [a, m] = mes.split('-').map(Number);
    return formatarISO(a, m, ultimoDiaDoMes(a, m));
  }

  // ("2026-02", 31) -> "2026-02-28": o dia que não existe no mês vira o último dia dele.
  function dataNoMes(mes, dia) {
    const [a, m] = mes.split('-').map(Number);
    return formatarISO(a, m, Math.min(dia, ultimoDiaDoMes(a, m)));
  }

  const formatoPercentual = new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // 0.0532 -> "5,32%"; sem valor (null) -> "—"
  function formatarPercentual(fracao) {
    return typeof fracao === 'number' && Number.isFinite(fracao) ? formatoPercentual.format(fracao) : '—';
  }

  // "2026-12" -> "12/2026"
  function formatarMes(mes) {
    return mes.slice(5) + '/' + mes.slice(0, 4);
  }

  /* ---------- IDs e texto ---------- */

  // gerarId('lan') -> "lan_8f2a91c03e11"
  function gerarId(prefixo) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
    return prefixo + '_' + hex;
  }

  // Só aceita cor no formato #rrggbb; qualquer outra coisa (por exemplo, vinda de um backup alterado) vira cinza.
  // As cores de categoria vão para o atributo style, então não podem carregar outro CSS.
  function corSegura(cor) {
    return /^#[0-9a-f]{6}$/i.test(String(cor)) ? cor : '#64748b';
  }

  function escaparHtml(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  App.util = {
    formatarMoeda,
    paraCentavos,
    centavosParaCampo,
    hojeISO,
    mesAtual,
    ultimoDiaDoMes,
    ehDataISO,
    ehMesISO,
    formatarData,
    somarMeses,
    nomeMes,
    agoraISO,
    somarDias,
    somarMesesDaData,
    diferencaDias,
    ultimoDiaDaCompetencia,
    dataNoMes,
    formatarMes,
    formatarPercentual,
    gerarId,
    corSegura,
    escaparHtml,
  };
})();
