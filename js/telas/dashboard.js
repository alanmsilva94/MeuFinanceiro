/* Dashboard (RF-32 a RF-37): período, filtros, cards com comparação, gráficos, composição do
   patrimônio, caixa e resumo das faturas dos cartões.

   Todos os números vêm de App.calc.painel (motor de cálculo); esta tela só mostra. */
(function () {
  'use strict';

  const U = App.util;
  const F = App.formulario;
  const G = App.graficos;
  const PN = App.calc.painel;
  const esc = U.escaparHtml;

  const MESES_NO_GRAFICO = 12;

  // Estado da tela (continua ao redesenhar).
  const estado = { modo: 'mes', de: '', ate: '', contaId: '', cartaoId: '', categoriaId: '' };

  function registros(nome) {
    return App.dados.registros(nome);
  }

  function dadosPreparados() {
    return PN.preparar({
      contas: registros('contas'),
      lancamentos: registros('lancamentos'),
      cartoes: registros('cartoes'),
      compras: registros('compras_cartao'),
      faturas: registros('faturas'),
      investimentos: registros('investimentos'),
    });
  }

  function filtroAtual() {
    return { contaId: estado.contaId, cartaoId: estado.cartaoId, categoriaId: estado.categoriaId };
  }

  function temFiltro() {
    return !!(estado.contaId || estado.cartaoId || estado.categoriaId);
  }

  // RF-32: mês escolhido no cabeçalho ou período personalizado.
  function periodoEscolhido() {
    if (estado.modo === 'mes') return PN.intervaloDoMes(App.estado.mes);
    return { de: estado.de, ate: estado.ate };
  }

  function periodoValido(p) {
    return U.ehDataISO(p.de) && U.ehDataISO(p.ate) && p.de <= p.ate;
  }

  const moeda = U.formatarMoeda;

  /* ---------- Controles ---------- */

  function htmlControles() {
    const contas = [{ valor: '', rotulo: 'Todas' }].concat(
      App.contas.listar().map(function (c) { return { valor: c.id, rotulo: c.nome + (c.ativa ? '' : ' (inativa)') }; })
    );
    const cartoes = [{ valor: '', rotulo: 'Todos' }].concat(
      App.cartoes.listar().map(function (c) { return { valor: c.id, rotulo: c.nome }; })
    );
    const categorias = [{ valor: '', rotulo: 'Todas' }].concat(
      App.categorias.listar().map(function (c) {
        return { valor: c.id, rotulo: c.nome + ' (' + App.categorias.NATUREZAS[c.natureza].toLowerCase() + ')' };
      })
    );
    const personalizado = estado.modo === 'personalizado';
    return (
      '<section class="painel"><div class="painel-controles">' +
      '<div><div class="campo__rotulo" style="margin-bottom:var(--esp-1)">Período</div>' +
      '<div class="segmentos" role="group" aria-label="Tipo de período">' +
      '<button type="button" data-acao="modo-mes" aria-pressed="' + !personalizado + '">' + esc(U.nomeMes(App.estado.mes)) + '</button>' +
      '<button type="button" data-acao="modo-personalizado" aria-pressed="' + personalizado + '">Personalizado</button></div></div>' +
      '<div class="filtros-painel" data-filtros>' +
      (personalizado
        ? F.campo({ nome: 'de', rotulo: 'De', tipo: 'data', valor: estado.de }) + F.campo({ nome: 'ate', rotulo: 'Até', tipo: 'data', valor: estado.ate })
        : '') +
      F.campo({ nome: 'contaId', rotulo: 'Conta', tipo: 'select', opcoes: contas, valor: estado.contaId }) +
      F.campo({ nome: 'cartaoId', rotulo: 'Cartão', tipo: 'select', opcoes: cartoes, valor: estado.cartaoId }) +
      F.campo({ nome: 'categoriaId', rotulo: 'Categoria', tipo: 'select', opcoes: categorias, valor: estado.categoriaId }) +
      (temFiltro() ? '<button type="button" class="botao botao--fantasma" data-acao="limpar">Limpar filtros</button>' : '') +
      '</div>' +
      (temFiltro()
        ? '<p class="painel-controles__dica">Os filtros valem para receitas, despesas, resultado e caixa. Conta limita o saldo em contas; cartão limita as faturas em aberto. ' +
          'Conta e cartão são alternativas: com os dois, entram os lançamentos da conta e as despesas do cartão. Investimentos e patrimônio mostram sempre o total.</p>'
        : '') +
      '</div></section>'
    );
  }

  /* ---------- Cards (RF-33, RF-34) ---------- */

  function htmlDelta(atual, anterior, subirEBom, rotulo) {
    const v = PN.variacao(atual, anterior);
    if (v.delta === 0) return '<span class="delta delta--neutro">Sem variação ' + esc(rotulo) + '</span>';
    const subiu = v.delta > 0;
    const classe = subiu === subirEBom ? 'delta--bom' : 'delta--ruim';
    return (
      '<span class="delta ' + classe + '"><span class="icone" aria-hidden="true">' + (subiu ? 'arrow_upward' : 'arrow_downward') + '</span>' +
      (v.pct === null ? '' : U.formatarPercentual(Math.abs(v.pct)) + ' · ') + (subiu ? '+' : '−') + moeda(Math.abs(v.delta)) + ' ' + esc(rotulo) + '</span>'
    );
  }

  function htmlCard(c, atual, anterior, rotuloAnterior) {
    const valor = c.valor(atual);
    const classeValor = c.colorirSinal ? (valor > 0 ? 'valor-positivo' : valor < 0 ? 'valor-negativo' : '') : '';
    return (
      '<div class="card-painel' + (c.destaque ? ' card-painel--destaque' : '') + '">' +
      '<span class="card-painel__rotulo">' + esc(c.rotulo) + '</span>' +
      '<span class="card-painel__valor ' + classeValor + '">' + moeda(valor) + '</span>' +
      htmlDelta(valor, c.valor(anterior), c.subirEBom, rotuloAnterior) +
      '<span class="card-painel__sub">' + c.sub(atual) + '</span></div>'
    );
  }

  function htmlCards(atual, anterior, rotuloAnterior) {
    const conta = estado.contaId ? App.contas.obter(estado.contaId) : null;
    const lista = [
      { rotulo: 'Patrimônio líquido', destaque: true, subirEBom: true, valor: function (f) { return f.patrimonio; },
        sub: function () { return 'Saldos + investimentos − faturas a pagar − parcelas futuras'; } },
      { rotulo: conta ? 'Saldo em ' + conta.nome : 'Saldo em contas', subirEBom: true, valor: function (f) { return f.saldo; },
        sub: function (f) { return 'Em ' + U.formatarData(f.corte); } },
      { rotulo: 'Total investido', subirEBom: true, valor: function (f) { return f.investido; },
        sub: function (f) { return 'Rentabilidade ' + moeda(f.rentabilidadeInvestimentos); } },
      { rotulo: 'Receitas', subirEBom: true, valor: function (f) { return f.receitas; },
        sub: function (f) { return f.receitasPrevistas ? 'Previsto (pendente): ' + moeda(f.receitasPrevistas) : 'Nada pendente'; } },
      { rotulo: 'Despesas', subirEBom: false, valor: function (f) { return f.despesas; },
        sub: function (f) { return (f.despesasPrevistas ? 'Previsto (pendente): ' + moeda(f.despesasPrevistas) : 'Nada pendente') + ' · cartão ' + moeda(f.despesasCartao); } },
      { rotulo: 'Resultado', subirEBom: true, colorirSinal: true, valor: function (f) { return f.resultado; },
        sub: function () { return 'Receitas − despesas, por competência'; } },
      { rotulo: estado.cartaoId ? 'Faturas em aberto (' + App.cartoes.obter(estado.cartaoId).nome + ')' : 'Faturas em aberto', subirEBom: false,
        valor: function (f) { return f.faturasEmAberto; },
        sub: function (f) { return 'Parcelas futuras: ' + moeda(f.parcelasFuturas); } },
    ];
    return '<div class="cards-painel">' + lista.map(function (c) { return htmlCard(c, atual, anterior, rotuloAnterior); }).join('') + '</div>';
  }

  /* ---------- Gráficos (RF-35) ---------- */

  function nomeCategoria(id) {
    if (id === PN.SEM_CATEGORIA) return 'Sem categoria';
    const c = App.categorias.obter(id);
    return c ? c.nome : 'Categoria removida';
  }

  function painelGrafico(titulo, subtitulo, corpo) {
    return '<section class="painel"><div class="painel__topo"><div><h2>' + esc(titulo) + '</h2><p class="texto-secundario">' + esc(subtitulo) + '</p></div></div>' + corpo + '</section>';
  }

  function htmlGraficos(P, atual, mesFinal, hoje) {
    const serie = PN.serieMensal(P, mesFinal, MESES_NO_GRAFICO, filtroAtual());
    const rotulos = serie.map(function (p) { return p.mes; });
    const series = [
      { nome: 'Receitas', cor: 'var(--viz-1)', valores: serie.map(function (p) { return p.receitas; }) },
      { nome: 'Despesas', cor: 'var(--viz-2)', valores: serie.map(function (p) { return p.despesas; }) },
    ];
    const receitasDespesas = painelGrafico(
      'Receitas x despesas por mês', 'Últimos ' + MESES_NO_GRAFICO + ' meses, por data de competência' + (temFiltro() ? ', com os filtros' : '') + '.',
      G.legenda(series) +
        G.colunasAgrupadas({ rotulos: rotulos, series: series, titulo: 'Receitas e despesas por mês' }) +
        G.tabela({
          colunas: ['Mês', 'Receitas', 'Despesas', 'Resultado'],
          linhas: serie.map(function (p) { return [G.rotuloMes(p.mes), moeda(p.receitas), moeda(p.despesas), moeda(p.resultado)]; }),
        })
    );

    const evolucao = PN.evolucaoDoPatrimonio(P, mesFinal, MESES_NO_GRAFICO, hoje);
    const patrimonio = painelGrafico(
      'Evolução do patrimônio líquido', 'Posição no fim de cada mês (o mês em curso vale até hoje). Não é filtrada.',
      G.linha({
        rotulos: evolucao.map(function (p) { return p.mes; }), valores: evolucao.map(function (p) { return p.patrimonio; }),
        nome: 'Patrimônio líquido', titulo: 'Evolução do patrimônio líquido',
      }) +
        G.tabela({
          colunas: ['Mês', 'Patrimônio líquido', 'Saldos em contas', 'Investimentos'],
          linhas: evolucao.map(function (p) { return [G.rotuloMes(p.mes), moeda(p.patrimonio), moeda(p.saldos), moeda(p.investimentos)]; }),
        })
    );

    const categorias = Object.keys(atual.porCategoria).map(function (id) {
      return { rotulo: nomeCategoria(id), valor: atual.porCategoria[id] };
    });
    const porCategoria = painelGrafico(
      'Despesas por categoria', 'No período escolhido, em ordem da maior para a menor. Inclui parcelas de cartão pelo mês da fatura.',
      G.ranking({ itens: categorias, vazio: 'Nenhuma despesa no período.' }) +
        G.tabela({
          colunas: ['Categoria', 'Despesas'],
          linhas: categorias.filter(function (c) { return c.valor > 0; }).sort(function (a, b) { return b.valor - a.valor; })
            .map(function (c) { return [c.rotulo, moeda(c.valor)]; }),
        })
    );

    const carteira = PN.investimentosEm(P, atual.corte);
    const classes = carteira.porClasse.map(function (c) { return { rotulo: App.investimentos.CLASSES[c.classe] || c.classe, valor: c.valorAtual }; });
    const distribuicao = painelGrafico(
      'Distribuição dos investimentos', 'Valor atual por classe em ' + U.formatarData(atual.corte) + '. Não é filtrada.',
      G.ranking({ itens: classes, vazio: 'Nenhum investimento com valor atual.' }) +
        G.tabela({ colunas: ['Classe', 'Valor atual'], linhas: classes.map(function (c) { return [c.rotulo, moeda(c.valor)]; }) })
    );

    return '<div class="grade-graficos">' + receitasDespesas + patrimonio + porCategoria + distribuicao + '</div>';
  }

  /* ---------- Composição do patrimônio, caixa e faturas ---------- */

  function htmlComposicao(P, atual, anterior) {
    const a = PN.patrimonio(P, atual.corte);
    const b = PN.patrimonio(P, anterior.corte);
    const linha = function (rotulo, classe, x, y) {
      return '<tr class="' + classe + '"><td>' + rotulo + '</td><td>' + moeda(x) + '</td><td class="texto-fraco">' + moeda(y) + '</td></tr>';
    };
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>Composição do patrimônio líquido</h2>' +
      '<p class="texto-secundario">Em ' + U.formatarData(atual.corte) + ', comparado com ' + U.formatarData(anterior.corte) +
      '. As parcelas futuras entram como obrigação porque a compra já foi feita.</p></div></div>' +
      '<table class="composicao"><thead><tr><th></th><th style="text-align:right">Agora</th><th style="text-align:right">Antes</th></tr></thead><tbody>' +
      linha('Saldos em contas', 'mais', a.saldos, b.saldos) + linha('Investimentos (valor atual)', 'mais', a.investimentos, b.investimentos) +
      linha('Faturas a pagar', 'menos', a.faturasAPagar, b.faturasAPagar) + linha('Parcelas futuras do cartão', 'menos', a.parcelasFuturas, b.parcelasFuturas) +
      linha('Patrimônio líquido', 'total', a.patrimonio, b.patrimonio) + '</tbody></table></section>'
    );
  }

  function htmlCaixa(atual) {
    const c = atual.caixa;
    const linhas = [
      ['Receitas recebidas', c.detalhe.receitas, true], ['Resgates de investimentos', c.detalhe.resgates, true],
      ['Despesas pagas', c.detalhe.despesas, false], ['Faturas de cartão pagas', c.detalhe.faturas, false],
      ['Aportes em investimentos', c.detalhe.aportes, false], ['Taxas de investimento', c.detalhe.taxas, false],
    ];
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>Caixa do período</h2>' +
      '<p class="texto-secundario">O que de fato entrou e saiu das contas, pela data de pagamento ou recebimento. Transferências não contam.</p></div></div>' +
      '<div class="totais" style="margin-bottom:var(--esp-3)">' +
      '<div class="total-item"><span class="total-item__rotulo">Entradas</span><span class="total-item__valor valor-positivo">' + moeda(c.entradas) + '</span></div>' +
      '<div class="total-item"><span class="total-item__rotulo">Saídas</span><span class="total-item__valor valor-negativo">' + moeda(c.saidas) + '</span></div>' +
      '<div class="total-item"><span class="total-item__rotulo">Saldo do período</span><span class="total-item__valor ' + (c.liquido < 0 ? 'valor-negativo' : '') + '">' + moeda(c.liquido) + '</span></div></div>' +
      linhas.map(function (l) {
        return '<div class="linha-simples"><span class="linha-simples__texto">' + l[0] + '</span><span>' + (l[2] ? '+ ' : '− ') + moeda(l[1]) + '</span></div>';
      }).join('') + '</section>'
    );
  }

  const SITUACAO_FATURA = { aberta: 'Aberta', fechada: 'Fechada', paga_parcial: 'Paga parcialmente', paga: 'Paga' };

  // RF-36: a fatura atual de cada cartão e quanto há a pagar.
  function htmlFaturas(hoje) {
    const cartoes = App.cartoes.listar().filter(function (c) { return c.ativo && (!estado.cartaoId || c.id === estado.cartaoId); });
    let corpo;
    if (!cartoes.length) {
      corpo = '<p class="vazio">Nenhum cartão ativo. Cadastre um em <a href="#cartoes">Cartões</a>.</p>';
    } else {
      corpo =
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Cartão</th><th>Fatura atual</th><th>Vence em</th><th class="numero">Total</th><th class="numero">A pagar (até a atual)</th><th>Situação</th><th class="numero">Limite disponível</th></tr></thead><tbody>' +
        cartoes.map(function (c) {
          const r = App.faturas.resumoDoCartao(c, hoje);
          const fa = r.faturaAtual;
          return (
            '<tr><td><strong>' + esc(c.nome) + '</strong></td><td>' + U.formatarMes(r.mesAtual) + '</td>' +
            '<td>' + (fa ? U.formatarData(fa.fatura.dataVencimento) : '—') + '</td><td class="numero">' + moeda(fa ? fa.total : 0) + '</td>' +
            '<td class="numero">' + moeda(r.aPagar) + '</td><td>' + (fa ? SITUACAO_FATURA[fa.situacao] : 'Sem compras') + '</td>' +
            '<td class="numero ' + (r.disponivel < 0 ? 'valor-negativo' : '') + '">' + moeda(r.disponivel) + '</td></tr>'
          );
        }).join('') + '</tbody></table></div>';
    }
    return '<section class="painel"><div class="painel__topo"><div><h2>Faturas dos cartões</h2><p class="texto-secundario">Fatura atual de cada cartão, o que há a pagar e o limite que sobra.</p></div></div>' + corpo + '</section>';
  }

  /* ---------- Tela ---------- */

  // Um filtro guardado pode apontar para algo que foi excluído (ou sumiu numa restauração de backup).
  function reconciliarFiltros() {
    if (estado.contaId && !App.contas.obter(estado.contaId)) estado.contaId = '';
    if (estado.cartaoId && !App.cartoes.obter(estado.cartaoId)) estado.cartaoId = '';
    if (estado.categoriaId && !App.categorias.obter(estado.categoriaId)) estado.categoriaId = '';
  }

  function render(elemento) {
    reconciliarFiltros();
    const hoje = U.hojeISO();
    const periodo = periodoEscolhido();

    if (!periodoValido(periodo)) {
      elemento.innerHTML =
        '<div data-tela="dashboard">' + htmlControles() +
        '<section class="painel" style="margin-top:var(--esp-4)"><p class="vazio">Informe um período válido: a data inicial precisa ser igual ou anterior à final.</p></section></div>';
    } else {
      const P = dadosPreparados();
      const anteriorPeriodo = PN.periodoAnterior(periodo.de, periodo.ate);
      const filtro = filtroAtual();
      const atual = PN.fotografia(P, periodo.de, periodo.ate, filtro, hoje);
      const anterior = PN.fotografia(P, anteriorPeriodo.de, anteriorPeriodo.ate, filtro, hoje);
      const rotuloAnterior = estado.modo === 'mes' ? 'vs ' + U.nomeMes(anteriorPeriodo.de.slice(0, 7)) : 'vs período anterior';
      const semDados = !registros('contas').length;

      elemento.innerHTML =
        '<div data-tela="dashboard">' + htmlControles() +
        (semDados ? '<section class="painel" style="margin-top:var(--esp-4)"><p>Comece cadastrando uma conta em <a href="#contas">Contas</a>; depois registre entradas e saídas.</p></section>' : '') +
        htmlCards(atual, anterior, rotuloAnterior) + htmlGraficos(P, atual, periodo.ate.slice(0, 7), hoje) +
        '<div class="grade-graficos">' + htmlComposicao(P, atual, anterior) + htmlCaixa(atual) + '</div>' +
        '<div style="margin-top:var(--esp-4)">' + htmlFaturas(hoje) + '</div></div>';
    }

    const raiz = elemento.firstElementChild;
    G.ativarTooltips(raiz);

    raiz.addEventListener('click', function (evento) {
      const botao = evento.target.closest('[data-acao]');
      if (!botao) return;
      const acao = botao.dataset.acao;
      if (acao === 'modo-mes') {
        estado.modo = 'mes';
      } else if (acao === 'modo-personalizado') {
        if (estado.modo !== 'personalizado') {
          const mes = PN.intervaloDoMes(App.estado.mes);
          if (!estado.de || !estado.ate) {
            estado.de = mes.de;
            estado.ate = mes.ate;
          }
        }
        estado.modo = 'personalizado';
      } else if (acao === 'limpar') {
        estado.contaId = estado.cartaoId = estado.categoriaId = '';
      } else {
        return;
      }
      App.roteador.renderizar();
    });

    raiz.addEventListener('change', function (evento) {
      const campo = evento.target;
      if (!campo.name || !(campo.name in { de: 1, ate: 1, contaId: 1, cartaoId: 1, categoriaId: 1 })) return;
      estado[campo.name] = campo.value;
      App.roteador.renderizar();
    });
  }

  App.roteador.registrar('dashboard', { titulo: 'Dashboard', icone: 'dashboard', menu: true, ordem: 1, render: render });
})();
