/* Compras no cartão de crédito (RF-17, RF-18, RF-20, RF-23).

   Uma compra é registrada uma vez e carrega as suas parcelas, cada uma com o mês da fatura em
   que cai. Cada parcela é despesa de competência no mês da sua fatura (regra 6.3).

   Estorno e cancelamento
   - Cancelar: só vale se nenhuma parcela já foi cobrada (todas em faturas ainda abertas).
   - Estorno total: as parcelas de faturas ainda abertas são canceladas; o que já foi cobrado
     (faturas fechadas ou pagas) volta como crédito na fatura em que o estorno é lançado.
   - Estorno parcial: gera um crédito na fatura escolhida e não mexe nas parcelas. */
(function () {
  'use strict';

  const U = App.util;
  const D = App.dados;
  const Erro = App.ErroValidacao;
  const C = App.calc.cartoes;

  const MAX_PARCELAS = 60;

  function listar(cartaoId) {
    return D.registros('compras_cartao')
      .filter(function (c) {
        return !cartaoId || c.cartaoId === cartaoId;
      })
      .sort(function (a, b) {
        return b.dataCompra.localeCompare(a.dataCompra) || String(b.criadoEm).localeCompare(String(a.criadoEm));
      });
  }

  function obter(id) {
    return D.registros('compras_cartao').find(function (c) {
      return c.id === id;
    });
  }

  function exigir(id) {
    const compra = obter(id);
    if (!compra) throw new Erro('Compra não encontrada.');
    return compra;
  }

  function validar(dados) {
    const cartao = App.cartoes.obter(dados.cartaoId);
    if (!cartao) throw new Erro('Escolha o cartão.');
    if (!cartao.ativo) throw new Erro('O cartão "' + cartao.nome + '" está inativo. Reative-o ou escolha outro cartão.');
    const descricao = D.textoObrigatorio(dados.descricao, 'a descrição da compra', 120);
    if (!Number.isSafeInteger(dados.valorTotal) || dados.valorTotal <= 0) {
      throw new Erro('Informe o valor total da compra, maior que zero.');
    }
    const parcelas = Number(dados.parcelas);
    if (dados.parcelas === '' || !Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) {
      throw new Erro('Informe o número de parcelas, de 1 a ' + MAX_PARCELAS + ' (1 é à vista).');
    }
    if (parcelas > dados.valorTotal) throw new Erro('O valor total é pequeno demais para ' + parcelas + ' parcelas.');
    if (!U.ehDataISO(dados.dataCompra)) throw new Erro('Informe a data da compra.');
    const categoria = App.categorias.obter(dados.categoriaId);
    if (!categoria) throw new Erro('Escolha a categoria.');
    if (categoria.natureza !== 'despesa') throw new Erro('A categoria "' + categoria.nome + '" não é de despesa. Escolha outra.');
    return {
      cartao: cartao,
      descricao: descricao,
      valorTotal: dados.valorTotal,
      parcelas: parcelas,
      dataCompra: dados.dataCompra,
      categoriaId: categoria.id,
      observacao: D.textoOpcional(dados.observacao, 'a observação', 300),
    };
  }

  // Prévia das parcelas por fatura (fluxo 3 da especificação), sem gravar nada.
  function prever(dados) {
    const v = validar(dados);
    const parcelas = C.montarParcelas(v.cartao, v.dataCompra, v.valorTotal, v.parcelas).map(function (p) {
      return Object.assign({}, p, C.datasDaFatura(v.cartao, p.mesFatura));
    });
    return { cartao: v.cartao, parcelas: parcelas };
  }

  // RF-17 e RF-18: registra a compra e distribui as parcelas nas faturas.
  async function criar(dados, hoje) {
    const v = validar(dados);
    const lista = C.montarParcelas(v.cartao, v.dataCompra, v.valorTotal, v.parcelas);
    const ctx = App.faturas.contexto(hoje);
    lista.forEach(function (p) {
      const fatura = App.faturas.obterPorMes(v.cartao.id, p.mesFatura);
      if (fatura && App.faturas.info(fatura, hoje, ctx).temPagamento) {
        throw new Erro(
          'A fatura de ' + U.formatarMes(p.mesFatura) + ' do cartão ' + v.cartao.nome +
            ' já tem pagamento e não pode receber novas parcelas. Use uma data de compra mais recente ou lance um ajuste na fatura.'
        );
      }
    });
    lista.forEach(function (p) {
      App.faturas.garantir(v.cartao, p.mesFatura);
    });
    const agora = U.agoraISO();
    D.registros('compras_cartao').push({
      id: U.gerarId('cmp'),
      cartaoId: v.cartao.id,
      descricao: v.descricao,
      valorTotal: v.valorTotal,
      categoriaId: v.categoriaId,
      dataCompra: v.dataCompra,
      situacao: 'ativa',
      parcelas: lista,
      observacao: v.observacao,
      estornos: [],
      criadoEm: agora,
      alteradoEm: agora,
    });
    App.faturas.sincronizarSituacoes(hoje);
    return D.gravar(['compras_cartao', 'faturas']);
  }

  // Só o que não mexe em valores: descrição, categoria e observação.
  async function editar(id, dados) {
    const compra = exigir(id);
    const descricao = D.textoObrigatorio(dados.descricao, 'a descrição da compra', 120);
    const categoria = App.categorias.obter(dados.categoriaId);
    if (!categoria) throw new Erro('Escolha a categoria.');
    if (categoria.natureza !== 'despesa') throw new Erro('A categoria "' + categoria.nome + '" não é de despesa. Escolha outra.');
    compra.descricao = descricao;
    compra.categoriaId = categoria.id;
    compra.observacao = D.textoOpcional(dados.observacao, 'a observação', 300);
    compra.alteradoEm = U.agoraISO();
    return D.gravar(['compras_cartao']);
  }

  function faturaDaParcela(compra, parcela) {
    return App.faturas.obterPorMes(compra.cartaoId, parcela.mesFatura);
  }

  // Exclui uma compra lançada por engano. Não vale se já houve pagamento ou estorno.
  async function excluir(id, hoje) {
    const compra = exigir(id);
    if (compra.estornos.length) {
      throw new Erro('Esta compra tem estorno lançado e não pode ser excluída. Se foi cancelada, deixe-a como está.');
    }
    const ctx = App.faturas.contexto(hoje);
    compra.parcelas.forEach(function (p) {
      const fatura = p.situacao === 'ativa' ? faturaDaParcela(compra, p) : null;
      if (fatura && App.faturas.info(fatura, hoje, ctx).temPagamento) {
        throw new Erro(
          'A fatura ' + App.faturas.rotulo(fatura) + ' já tem pagamento. Use estorno ou cancelamento em vez de excluir a compra.'
        );
      }
    });
    const lista = D.registros('compras_cartao');
    lista.splice(lista.indexOf(compra), 1);
    App.faturas.sincronizarSituacoes(hoje);
    return D.gravar(['compras_cartao', 'faturas']);
  }

  // Parcelas ativas separadas em já cobradas (fatura fechada ou paga) e futuras (fatura aberta).
  function separarParcelas(compra, hoje) {
    const ctx = App.faturas.contexto(hoje);
    const cobradas = [];
    const futuras = [];
    compra.parcelas.forEach(function (p) {
      if (p.situacao !== 'ativa') return;
      const fatura = faturaDaParcela(compra, p);
      const aberta = !fatura || App.faturas.info(fatura, hoje, ctx).situacao === 'aberta';
      (aberta ? futuras : cobradas).push(p);
    });
    return { cobradas: cobradas, futuras: futuras };
  }

  function somaValores(lista, campo) {
    return lista.reduce(function (t, x) {
      return t + x[campo];
    }, 0);
  }

  function totalEstornado(compra) {
    return somaValores(compra.estornos, 'valor');
  }

  // RF-23: cancela uma compra que ainda não foi cobrada em nenhuma fatura.
  async function cancelar(id, hoje) {
    const compra = exigir(id);
    if (compra.situacao !== 'ativa') throw new Erro('Esta compra já está ' + compra.situacao + '.');
    const { cobradas, futuras } = separarParcelas(compra, hoje);
    if (cobradas.length) {
      throw new Erro('Há parcelas já cobradas em fatura fechada ou paga. Use "Estorno total" para receber o crédito.');
    }
    futuras.forEach(function (p) {
      p.situacao = 'cancelada';
    });
    compra.situacao = 'cancelada';
    compra.alteradoEm = U.agoraISO();
    App.faturas.sincronizarSituacoes(hoje);
    return D.gravar(['compras_cartao', 'faturas']);
  }

  // Fatura que recebe o crédito: a escolhida ou, se não houver, a fatura atual do cartão.
  function faturaDoCredito(cartao, mesCredito, hoje) {
    const mes = mesCredito || C.mesDaFatura(cartao, hoje || U.hojeISO());
    if (!U.ehMesISO(mes)) throw new Erro('Escolha a fatura que recebe o crédito.');
    const fatura = App.faturas.garantir(cartao, mes).fatura;
    App.faturas.exigirSemPagamento(fatura, hoje);
    return fatura;
  }

  // O que o estorno total faria, sem gravar nada (a tela mostra isto antes de confirmar):
  // quantas parcelas seriam canceladas, quanto elas somam e quanto já cobrado volta como crédito.
  function previaDoEstornoTotal(compra, hoje) {
    const futuras = separarParcelas(compra, hoje).futuras;
    const valorCancelado = somaValores(futuras, 'valor');
    return {
      parcelasCanceladas: futuras.length,
      valorCancelado: valorCancelado,
      credito: compra.valorTotal - totalEstornado(compra) - valorCancelado,
    };
  }

  // RF-23: estorno total. Parcelas de faturas abertas são canceladas; o que já foi cobrado volta como crédito.
  async function estornarTotal(id, dados, hoje) {
    const compra = exigir(id);
    if (compra.situacao !== 'ativa') throw new Erro('Esta compra já está ' + compra.situacao + '.');
    const cartao = App.cartoes.obter(compra.cartaoId);
    const { futuras } = separarParcelas(compra, hoje);
    // Crédito = o que já foi cobrado e ainda não foi devolvido. Pode dar negativo quando estornos
    // parciais anteriores passaram do que já tinha sido cobrado: nesse caso o excesso é revertido,
    // para a compra não ficar com crédito a mais depois que as parcelas futuras forem canceladas.
    const credito = previaDoEstornoTotal(compra, hoje).credito;
    if (credito !== 0) {
      const fatura = faturaDoCredito(cartao, dados && dados.mesCredito, hoje);
      const ajuste = {
        id: U.gerarId('aju'),
        descricao: (credito > 0 ? 'Estorno: ' : 'Reversão de crédito do estorno total: ') + compra.descricao,
        valor: -credito,
        tipo: 'estorno_total',
        compraId: compra.id,
      };
      fatura.ajustes.push(ajuste);
      compra.estornos.push({ id: U.gerarId('est'), tipo: 'total', valor: Math.max(0, credito), mesFatura: fatura.mes, ajusteId: ajuste.id });
      App.faturas.atualizar(fatura, hoje);
    }
    futuras.forEach(function (p) {
      p.situacao = 'cancelada';
    });
    compra.situacao = 'estornada';
    compra.alteradoEm = U.agoraISO();
    App.faturas.sincronizarSituacoes(hoje);
    return D.gravar(['compras_cartao', 'faturas']);
  }

  // RF-23: estorno parcial, com crédito na fatura escolhida; as parcelas continuam como estão.
  async function estornarParcial(id, dados, hoje) {
    const compra = exigir(id);
    if (compra.situacao !== 'ativa') throw new Erro('Esta compra já está ' + compra.situacao + '.');
    const restante = compra.valorTotal - totalEstornado(compra);
    if (!Number.isSafeInteger(dados.valor) || dados.valor <= 0) throw new Erro('Informe o valor estornado, maior que zero.');
    if (dados.valor > restante) {
      throw new Erro('O valor estornado passa do que resta da compra (' + U.formatarMoeda(restante) + ').');
    }
    const cartao = App.cartoes.obter(compra.cartaoId);
    const fatura = faturaDoCredito(cartao, dados.mesCredito, hoje);
    const ajuste = { id: U.gerarId('aju'), descricao: 'Estorno parcial: ' + compra.descricao, valor: -dados.valor, tipo: 'estorno_parcial', compraId: compra.id };
    fatura.ajustes.push(ajuste);
    compra.estornos.push({ id: U.gerarId('est'), tipo: 'parcial', valor: dados.valor, mesFatura: fatura.mes, ajusteId: ajuste.id });
    compra.alteradoEm = U.agoraISO();
    App.faturas.atualizar(fatura, hoje);
    return D.gravar(['compras_cartao', 'faturas']);
  }

  // RF-20: move uma parcela para outra fatura (por exemplo, quando a loja processa a compra com atraso).
  async function moverParcela(compraId, numero, mesDestino, hoje) {
    const compra = exigir(compraId);
    const parcela = compra.parcelas.find(function (p) {
      return p.numero === numero;
    });
    if (!parcela || parcela.situacao !== 'ativa') throw new Erro('Parcela não encontrada ou já cancelada.');
    if (!U.ehMesISO(mesDestino)) throw new Erro('Escolha a fatura de destino.');
    if (mesDestino === parcela.mesFatura) throw new Erro('A parcela já está nessa fatura.');
    const cartao = App.cartoes.obter(compra.cartaoId);
    const ctx = App.faturas.contexto(hoje);
    const origem = faturaDaParcela(compra, parcela);
    if (origem) App.faturas.exigirSemPagamento(origem, hoje, ctx);
    const existente = App.faturas.obterPorMes(cartao.id, mesDestino);
    if (existente) App.faturas.exigirSemPagamento(existente, hoje, ctx);
    const destino = App.faturas.garantir(cartao, mesDestino).fatura;
    if (!parcela.mesFaturaOriginal) parcela.mesFaturaOriginal = parcela.mesFatura;
    parcela.mesFatura = mesDestino;
    compra.alteradoEm = U.agoraISO();
    if (origem) App.faturas.atualizar(origem, hoje);
    App.faturas.atualizar(destino, hoje);
    return D.gravar(['compras_cartao', 'faturas']);
  }

  App.compras = {
    MAX_PARCELAS: MAX_PARCELAS,
    listar: listar,
    obter: obter,
    prever: prever,
    criar: criar,
    editar: editar,
    excluir: excluir,
    cancelar: cancelar,
    estornarTotal: estornarTotal,
    estornarParcial: estornarParcial,
    moverParcela: moverParcela,
    separarParcelas: separarParcelas,
    previaDoEstornoTotal: previaDoEstornoTotal,
    totalEstornado: totalEstornado,
  };
})();
