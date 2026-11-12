/* Exportação para Excel (RF-41): lançamentos, compras no cartão e investimentos, em um só arquivo
   .xlsx com uma aba para cada assunto. Só leitura: nada é alterado nos dados.

   Valores em reais (número com formato de moeda), datas como datas do Excel (dá para filtrar e
   ordenar), e nomes no lugar de códigos (conta, categoria, cartão). */
(function () {
  'use strict';

  const U = App.util;
  const D = App.dados;

  const TIPOS = {
    receita: 'Receita',
    despesa: 'Despesa',
    transferencia: 'Transferência',
    aporte: 'Aporte',
    resgate: 'Resgate',
    pagamento_fatura: 'Pagamento de fatura',
    taxa_investimento: 'Taxa de investimento',
  };
  const SITUACOES = { pendente: 'Pendente', pago: 'Pago', recebido: 'Recebido' };
  const SITUACOES_COMPRA = { ativa: 'Ativa', estornada: 'Estornada', cancelada: 'Cancelada' };
  const TIPOS_MOVIMENTACAO = { aporte: 'Aporte', resgate: 'Resgate', rendimento: 'Rendimento', taxa: 'Taxa' };

  function porId(lista) {
    const mapa = {};
    lista.forEach(function (x) { mapa[x.id] = x; });
    return mapa;
  }

  function nome(mapa, id) {
    return id && mapa[id] ? mapa[id].nome : '';
  }

  function porData(campo) {
    return function (a, b) {
      return String(a[campo] || '').localeCompare(String(b[campo] || ''));
    };
  }

  function planilhaLancamentos(ctx) {
    const faturaPorId = porId(D.registros('faturas'));
    const linhas = D.registros('lancamentos').slice().sort(porData('dataCompetencia')).map(function (l) {
      let origem = '';
      if (l.recorrenciaId) origem = 'Recorrência';
      else if (l.origem && l.origem.investimentoId) origem = 'Investimento: ' + nome(ctx.investimentos, l.origem.investimentoId);
      else if (l.origem && l.origem.faturaId) origem = 'Fatura: ' + (faturaPorId[l.origem.faturaId] ? App.faturas.rotulo(faturaPorId[l.origem.faturaId]) : '');
      return [
        TIPOS[l.tipo] || l.tipo, l.descricao, l.valor, nome(ctx.categorias, l.categoriaId), nome(ctx.contas, l.contaId),
        nome(ctx.contas, l.contaDestinoId), l.dataCompetencia, l.dataVencimento, l.dataPagamento,
        SITUACOES[l.situacao] || l.situacao, origem, l.observacao,
      ];
    });
    return {
      nome: 'Lançamentos',
      colunas: [
        { titulo: 'Tipo' }, { titulo: 'Descrição', largura: 34 }, { titulo: 'Valor', tipo: 'moeda' }, { titulo: 'Categoria' }, { titulo: 'Conta' },
        { titulo: 'Conta de destino' }, { titulo: 'Competência', tipo: 'data' }, { titulo: 'Vencimento ou previsão', tipo: 'data' },
        { titulo: 'Pagamento ou recebimento', tipo: 'data' }, { titulo: 'Situação' }, { titulo: 'Origem', largura: 28 }, { titulo: 'Observação', largura: 34 },
      ],
      linhas: linhas,
    };
  }

  function planilhasDeCompras(ctx) {
    const compras = D.registros('compras_cartao').slice().sort(porData('dataCompra'));
    const resumo = compras.map(function (c) {
      return [
        c.dataCompra, c.descricao, nome(ctx.cartoes, c.cartaoId), nome(ctx.categorias, c.categoriaId), c.valorTotal, c.parcelas.length,
        SITUACOES_COMPRA[c.situacao] || c.situacao, c.estornos.reduce(function (t, e) { return t + e.valor; }, 0), c.observacao,
      ];
    });
    const parcelas = [];
    compras.forEach(function (c) {
      c.parcelas.forEach(function (p) {
        parcelas.push([
          c.dataCompra, c.descricao, nome(ctx.cartoes, c.cartaoId), p.numero + '/' + c.parcelas.length, p.mesFatura ? U.formatarMes(p.mesFatura) : '',
          p.valor, p.situacao === 'ativa' ? 'Ativa' : 'Cancelada',
        ]);
      });
    });
    return [
      {
        nome: 'Compras no cartão',
        colunas: [
          { titulo: 'Data da compra', tipo: 'data' }, { titulo: 'Descrição', largura: 34 }, { titulo: 'Cartão' }, { titulo: 'Categoria' },
          { titulo: 'Valor total', tipo: 'moeda' }, { titulo: 'Parcelas', tipo: 'numero' }, { titulo: 'Situação' },
          { titulo: 'Total estornado', tipo: 'moeda' }, { titulo: 'Observação', largura: 34 },
        ],
        linhas: resumo,
      },
      {
        nome: 'Parcelas do cartão',
        colunas: [
          { titulo: 'Data da compra', tipo: 'data' }, { titulo: 'Compra', largura: 34 }, { titulo: 'Cartão' }, { titulo: 'Parcela' },
          { titulo: 'Fatura (mês do vencimento)' }, { titulo: 'Valor', tipo: 'moeda' }, { titulo: 'Situação' },
        ],
        linhas: parcelas,
      },
    ];
  }

  function planilhasDeInvestimentos(ctx) {
    const lista = D.registros('investimentos').slice().sort(D.porNome);
    const resumo = lista.map(function (inv) {
      const r = App.investimentos.resumo(inv);
      return [
        inv.nome, App.investimentos.CLASSES[inv.classe] || inv.classe, inv.instituicao, inv.quantidade, r.aportado, r.resgatado,
        r.rendimentos, r.taxas, r.valorAtual, r.valorAtualEstimado ? 'Estimado' : r.dataAtualizacao, r.rentabilidade, r.rentabilidadePct,
        inv.ativo ? 'Ativo' : 'Encerrado',
      ];
    });
    const movimentacoes = [];
    lista.forEach(function (inv) {
      inv.movimentacoes.forEach(function (m) {
        const lan = App.lancamentos.obter(m.lancamentoId);
        movimentacoes.push([inv.nome, m.data, TIPOS_MOVIMENTACAO[m.tipo] || m.tipo, m.valor, lan ? nome(ctx.contas, lan.contaId) : '']);
      });
    });
    movimentacoes.sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])); });
    const historico = [];
    lista.forEach(function (inv) {
      inv.atualizacoes.forEach(function (a) {
        historico.push([inv.nome, a.data, a.valorAtual]);
      });
    });
    historico.sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])); });
    return [
      {
        nome: 'Investimentos',
        colunas: [
          { titulo: 'Investimento', largura: 30 }, { titulo: 'Classe', largura: 26 }, { titulo: 'Instituição' }, { titulo: 'Quantidade', tipo: 'numero' },
          { titulo: 'Aportado', tipo: 'moeda' }, { titulo: 'Resgatado', tipo: 'moeda' }, { titulo: 'Rendimentos', tipo: 'moeda' },
          { titulo: 'Taxas à parte', tipo: 'moeda' }, { titulo: 'Valor atual', tipo: 'moeda' }, { titulo: 'Valor atual em', tipo: 'data' },
          { titulo: 'Rentabilidade (R$)', tipo: 'moeda' }, { titulo: 'Rentabilidade (%)', tipo: 'percentual' }, { titulo: 'Situação' },
        ],
        linhas: resumo,
      },
      {
        nome: 'Movimentações investimentos',
        colunas: [
          { titulo: 'Investimento', largura: 30 }, { titulo: 'Data', tipo: 'data' }, { titulo: 'Tipo' }, { titulo: 'Valor', tipo: 'moeda' }, { titulo: 'Conta' },
        ],
        linhas: movimentacoes,
      },
      {
        nome: 'Valores atuais',
        colunas: [{ titulo: 'Investimento', largura: 30 }, { titulo: 'Data', tipo: 'data' }, { titulo: 'Valor atual', tipo: 'moeda' }],
        linhas: historico,
      },
    ];
  }

  // As abas da planilha, em ordem. A coluna "Valor atual em" aceita data ou o texto "Estimado".
  function montarPlanilhas() {
    const ctx = {
      contas: porId(D.registros('contas')),
      categorias: porId(D.registros('categorias')),
      cartoes: porId(D.registros('cartoes')),
      investimentos: porId(D.registros('investimentos')),
    };
    return [planilhaLancamentos(ctx)].concat(planilhasDeCompras(ctx), planilhasDeInvestimentos(ctx));
  }

  // Devolve uma Promise com os bytes do .xlsx (comprimido, quando o navegador permite).
  function gerarXlsx() {
    return App.xlsx.criar(montarPlanilhas());
  }

  function nomeDoArquivo(data) {
    const d = data || new Date();
    return 'MeuFinanceiro-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.xlsx';
  }

  App.exportacao = { montarPlanilhas: montarPlanilhas, gerarXlsx: gerarXlsx, nomeDoArquivo: nomeDoArquivo };
})();
