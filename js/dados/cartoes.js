/* Cadastro de cartões de crédito (RF-16). */
(function () {
  'use strict';

  const U = App.util;
  const D = App.dados;
  const Erro = App.ErroValidacao;

  const MODOS_FECHAMENTO = {
    proxima: 'Vai para a fatura seguinte (padrão)',
    atual: 'Entra na fatura que fecha hoje',
  };

  function listar() {
    return D.registros('cartoes').slice().sort(D.porNome);
  }

  function obter(id) {
    return D.registros('cartoes').find(function (c) {
      return c.id === id;
    });
  }

  function validarDia(valor, descricao) {
    const dia = Number(valor);
    if (valor === '' || valor === null || valor === undefined || !Number.isInteger(dia) || dia < 1 || dia > 31) {
      throw new Erro('Informe ' + descricao + ' (um dia de 1 a 31).');
    }
    return dia;
  }

  function validar(dados, idAtual) {
    const nome = D.textoObrigatorio(dados.nome, 'o nome do cartão', 40);
    const instituicao = D.textoObrigatorio(dados.instituicao, 'a instituição', 60);
    if (!Number.isSafeInteger(dados.limite) || dados.limite <= 0) {
      throw new Erro('Informe o limite total do cartão, maior que zero (por exemplo, 8.000,00).');
    }
    const diaFechamento = validarDia(dados.diaFechamento, 'o dia de fechamento da fatura');
    const diaVencimento = validarDia(dados.diaVencimento, 'o dia de vencimento da fatura');
    const modo = dados.compraNoDiaFechamento || 'proxima';
    if (!MODOS_FECHAMENTO[modo]) throw new Erro('Escolha para qual fatura vão as compras feitas no dia do fechamento.');
    const repetido = D.registros('cartoes').some(function (c) {
      return c.id !== idAtual && D.chaveDeNome(c.nome) === D.chaveDeNome(nome);
    });
    if (repetido) throw new Erro('Já existe um cartão chamado "' + nome + '". Use outro nome.');
    return {
      nome: nome,
      instituicao: instituicao,
      limite: dados.limite,
      diaFechamento: diaFechamento,
      diaVencimento: diaVencimento,
      compraNoDiaFechamento: modo,
    };
  }

  async function criar(dados) {
    const valores = validar(dados, null);
    const agora = U.agoraISO();
    D.registros('cartoes').push(
      Object.assign({ id: U.gerarId('car') }, valores, { ativo: true, criadoEm: agora, alteradoEm: agora })
    );
    return D.gravar(['cartoes']);
  }

  // Mudar os dias vale para compras novas. As faturas que ainda não têm pagamento recebem as
  // novas datas de fechamento e vencimento; as parcelas já distribuídas continuam onde estão.
  async function editar(id, dados) {
    const cartao = obter(id);
    if (!cartao) throw new Erro('Cartão não encontrado.');
    Object.assign(cartao, validar(dados, id), { alteradoEm: U.agoraISO() });
    let faturasAjustadas = false;
    D.registros('faturas').forEach(function (f) {
      if (f.cartaoId !== id || f.pagamentoIds.length) return;
      const datas = App.calc.cartoes.datasDaFatura(cartao, f.mes);
      if (f.dataFechamento !== datas.dataFechamento || f.dataVencimento !== datas.dataVencimento) {
        Object.assign(f, datas, { alteradoEm: cartao.alteradoEm });
        faturasAjustadas = true;
      }
    });
    return D.gravar(faturasAjustadas ? ['cartoes', 'faturas'] : ['cartoes']);
  }

  async function definirAtivo(id, ativo) {
    const cartao = obter(id);
    if (!cartao) throw new Erro('Cartão não encontrado.');
    cartao.ativo = !!ativo;
    cartao.alteradoEm = U.agoraISO();
    return D.gravar(['cartoes']);
  }

  // Cartão com compras não pode ser excluído, só inativado (como as contas).
  async function excluir(id) {
    const cartao = obter(id);
    if (!cartao) throw new Erro('Cartão não encontrado.');
    const compras = D.registros('compras_cartao').filter(function (c) {
      return c.cartaoId === id;
    }).length;
    const pagamentos = D.registros('faturas').filter(function (f) {
      return f.cartaoId === id && f.pagamentoIds.length;
    }).length;
    if (compras > 0 || pagamentos > 0) {
      throw new Erro(
        'O cartão "' + cartao.nome + '" tem ' + compras + ' compra(s)' +
          (pagamentos ? ' e faturas pagas' : '') + ' e não pode ser excluído. Inative o cartão para escondê-lo.'
      );
    }
    // Faturas com ajuste ou encargo já têm informação do usuário: não são "vazias" e não somem em silêncio.
    const comRegistros = D.registros('faturas').filter(function (f) {
      return f.cartaoId === id && (f.ajustes.length || f.encargos.length);
    }).length;
    if (comRegistros > 0) {
      throw new Erro(
        'O cartão "' + cartao.nome + '" tem ' + comRegistros + ' fatura(s) com ajustes ou encargos lançados e não pode ser excluído. Inative o cartão para escondê-lo.'
      );
    }
    const faturas = D.registros('faturas');
    for (let i = faturas.length - 1; i >= 0; i--) {
      if (faturas[i].cartaoId === id) faturas.splice(i, 1); // faturas vazias geradas automaticamente
    }
    const lista = D.registros('cartoes');
    lista.splice(lista.indexOf(cartao), 1);
    return D.gravar(['cartoes', 'faturas']);
  }

  App.cartoes = {
    MODOS_FECHAMENTO: MODOS_FECHAMENTO,
    listar: listar,
    obter: obter,
    criar: criar,
    editar: editar,
    definirAtivo: definirAtivo,
    excluir: excluir,
  };
})();
