/* Cálculo das datas das recorrências (RF-13, RF-14). Funções puras: não leem nem gravam dados.

   Uma recorrência tem: periodicidade (semanal, mensal, anual ou dias), intervaloDias (só para
   "dias"), dataInicio e dataFim (opcional). A ocorrência de número n é sempre calculada a
   partir da data inicial, e não da ocorrência anterior; assim o dia 31 volta a ser 31 depois
   de um mês curto. */
(function () {
  'use strict';

  const U = App.util;

  const PERIODICIDADES = {
    mensal: 'Todo mês',
    semanal: 'Toda semana',
    anual: 'Todo ano',
    dias: 'A cada N dias',
  };

  const LIMITE_VOLTAS = 100000; // trava de segurança contra laço sem fim

  function dataDaOcorrencia(rec, n) {
    switch (rec.periodicidade) {
      case 'semanal':
        return U.somarDias(rec.dataInicio, 7 * n);
      case 'mensal':
        return U.somarMesesDaData(rec.dataInicio, n);
      case 'anual':
        return U.somarMesesDaData(rec.dataInicio, 12 * n);
      case 'dias':
        return U.somarDias(rec.dataInicio, rec.intervaloDias * n);
      default:
        return null;
    }
  }

  // Datas das ocorrências depois de `depois` (exclusive; vazio = desde o início) e até `ate`
  // (inclusive), respeitando a data final. `maximo` limita quantas datas voltam.
  function ocorrencias(rec, opcoes) {
    const lista = [];
    if (!PERIODICIDADES[rec.periodicidade]) return lista;
    if (rec.periodicidade === 'dias' && !(rec.intervaloDias >= 1)) return lista;
    const maximo = opcoes.maximo || 366;
    for (let n = 0; n < LIMITE_VOLTAS; n++) {
      const data = dataDaOcorrencia(rec, n);
      if (data > opcoes.ate) break;
      if (rec.dataFim && data > rec.dataFim) break;
      if (!opcoes.depois || data > opcoes.depois) {
        lista.push(data);
        if (lista.length >= maximo) break;
      }
    }
    return lista;
  }

  // RF-14: as ocorrências são geradas até o último dia do mês seguinte ao de hoje.
  function fimDoMesSeguinte(hojeISO) {
    return U.ultimoDiaDaCompetencia(U.somarMeses(hojeISO.slice(0, 7), 1));
  }

  function descricaoRepeticao(rec) {
    if (rec.periodicidade === 'dias') return 'A cada ' + rec.intervaloDias + ' dias';
    return PERIODICIDADES[rec.periodicidade] || rec.periodicidade;
  }

  App.calc.recorrencias = {
    PERIODICIDADES: PERIODICIDADES,
    ocorrencias: ocorrencias,
    fimDoMesSeguinte: fimDoMesSeguinte,
    descricaoRepeticao: descricaoRepeticao,
  };
})();
