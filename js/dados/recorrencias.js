/* Recorrências: modelos que geram lançamentos pendentes automaticamente (RF-13 a RF-15).

   Como funciona
   - Uma recorrência é criada a partir do formulário de Entradas/Saídas: o lançamento digitado
     vira a primeira ocorrência e as seguintes são geradas como pendentes.
   - Ao abrir o programa (e ao criar/editar), geram-se as ocorrências até o fim do mês seguinte.
   - `ultimaGerada` é o cursor: só se geram datas depois dela. Por isso uma ocorrência que o
     usuário apagou não volta. Como segurança extra, cada ocorrência guarda em
     origem = { recorrenciaId, dataOcorrencia } e nunca se gera a mesma duas vezes.
   - Editar um lançamento gerado altera só ele (RF-15). Editar o modelo vale para as ocorrências
     futuras; o usuário escolhe se as pendentes já geradas também são atualizadas.
   - A periodicidade e a data inicial não mudam depois da criação: para mudar o ritmo,
     encerra-se a recorrência (data final) e cria-se outra. */
(function () {
  'use strict';

  const U = App.util;
  const D = App.dados;
  const Erro = App.ErroValidacao;
  const R = App.calc.recorrencias;

  const LIMITE_POR_EXECUCAO = 366; // trava de segurança em cada geração
  const LIMITE_NA_CRIACAO = 120; // evita criar, por engano, centenas de lançamentos de uma vez

  function listar() {
    return D.registros('recorrencias')
      .slice()
      .sort(function (a, b) {
        return a.modelo.descricao.localeCompare(b.modelo.descricao, 'pt-BR', { sensitivity: 'base' });
      });
  }

  function obter(id) {
    return D.registros('recorrencias').find(function (r) {
      return r.id === id;
    });
  }

  function validarAgenda(a) {
    if (!R.PERIODICIDADES[a.periodicidade]) throw new Erro('Escolha a periodicidade da repetição.');
    let intervalo = null;
    if (a.periodicidade === 'dias') {
      intervalo = Number(a.intervaloDias);
      if (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 3650) {
        throw new Erro('Informe de quantos em quantos dias o lançamento se repete (de 1 a 3650).');
      }
    }
    if (!U.ehDataISO(a.dataInicio)) throw new Erro('Informe a data inicial da recorrência.');
    const fim = a.dataFim ? a.dataFim : null;
    if (fim && !U.ehDataISO(fim)) throw new Erro('A data final da repetição é inválida.');
    if (fim && fim < a.dataInicio) throw new Erro('A data final da repetição não pode ser anterior à primeira ocorrência.');
    return { periodicidade: a.periodicidade, intervaloDias: intervalo, dataInicio: a.dataInicio, dataFim: fim };
  }

  function chavesExistentes() {
    const chaves = new Set();
    D.registros('lancamentos').forEach(function (l) {
      if (l.origem && l.origem.recorrenciaId && l.origem.dataOcorrencia) {
        chaves.add(l.origem.recorrenciaId + '|' + l.origem.dataOcorrencia);
      }
    });
    return chaves;
  }

  // Só gera enquanto a conta estiver ativa e a categoria existir.
  function podeGerar(rec) {
    const conta = App.contas.obter(rec.modelo.contaId);
    return !!(conta && conta.ativa && App.categorias.obter(rec.modelo.categoriaId));
  }

  // Gera, na memória, as ocorrências que faltam até o fim do mês seguinte. Devolve quantas criou.
  function gerarParaRecorrencia(rec, hoje, chaves) {
    const datas = R.ocorrencias(rec, {
      depois: rec.ultimaGerada,
      ate: R.fimDoMesSeguinte(hoje),
      maximo: LIMITE_POR_EXECUCAO,
    });
    if (!datas.length) return 0;
    const m = rec.modelo;
    let criadas = 0;
    datas.forEach(function (data) {
      const chave = rec.id + '|' + data;
      if (chaves.has(chave)) return;
      chaves.add(chave);
      const dias = m.diasAteVencimento;
      D.registros('lancamentos').push(
        App.lancamentos.montarMovimento(
          m.tipo,
          {
            descricao: m.descricao,
            valor: m.valor,
            categoriaId: m.categoriaId,
            contaId: m.contaId,
            dataCompetencia: data,
            dataVencimento: Number.isInteger(dias) ? U.somarDias(data, dias) : null,
            dataPagamento: null,
            situacao: 'pendente',
            observacao: '',
          },
          { recorrenciaId: rec.id, origem: { recorrenciaId: rec.id, dataOcorrencia: data } }
        )
      );
      criadas++;
    });
    rec.ultimaGerada = datas[datas.length - 1];
    rec.alteradoEm = U.agoraISO();
    return criadas;
  }

  // RF-14: chamada ao abrir o programa. Devolve { geradas, puladas, salvo }.
  // `puladas` conta recorrências ativas que não geraram porque a conta está inativa.
  async function gerarPendentes(hoje) {
    const dia = hoje || U.hojeISO();
    const chaves = chavesExistentes();
    let geradas = 0;
    let puladas = 0;
    let mudou = false;
    D.registros('recorrencias').forEach(function (rec) {
      if (!rec.ativa) return;
      if (!podeGerar(rec)) {
        puladas++;
        return;
      }
      const antes = rec.ultimaGerada;
      geradas += gerarParaRecorrencia(rec, dia, chaves);
      if (rec.ultimaGerada !== antes) mudou = true;
    });
    const salvo = mudou ? await D.gravar(['lancamentos', 'recorrencias']) : true;
    return { geradas: geradas, puladas: puladas, salvo: salvo };
  }

  // RF-13: cria a recorrência a partir dos dados do formulário. O lançamento digitado é a
  // primeira ocorrência (com a situação e a observação que o usuário informou).
  // agenda: { periodicidade, intervaloDias, dataFim }. Devolve { salvo, geradas }.
  async function criarDoFormulario(tipo, dados, agenda, hoje) {
    const dia = hoje || U.hojeISO();
    const v = App.lancamentos.validarMovimento(tipo, dados, null);
    const ag = validarAgenda(Object.assign({}, agenda, { dataInicio: v.dataCompetencia }));
    const id = U.gerarId('rec');
    const agora = U.agoraISO();
    const rec = {
      id: id,
      modelo: {
        tipo: tipo,
        descricao: v.descricao,
        valor: v.valor,
        categoriaId: v.categoriaId,
        contaId: v.contaId,
        diasAteVencimento: v.dataVencimento ? U.diferencaDias(v.dataCompetencia, v.dataVencimento) : null,
      },
      periodicidade: ag.periodicidade,
      intervaloDias: ag.intervaloDias,
      dataInicio: ag.dataInicio,
      dataFim: ag.dataFim,
      ultimaGerada: v.dataCompetencia,
      ativa: true,
      criadoEm: agora,
      alteradoEm: agora,
    };
    const previstas = R.ocorrencias(rec, { depois: null, ate: R.fimDoMesSeguinte(dia), maximo: LIMITE_NA_CRIACAO + 1 });
    if (previstas.length > LIMITE_NA_CRIACAO) {
      throw new Erro(
        'Com essa data de início, a repetição geraria mais de ' + LIMITE_NA_CRIACAO +
          ' lançamentos de uma vez. Use uma data de competência mais próxima de hoje.'
      );
    }
    D.registros('recorrencias').push(rec);
    D.registros('lancamentos').push(
      App.lancamentos.montarMovimento(tipo, v, { recorrenciaId: id, origem: { recorrenciaId: id, dataOcorrencia: v.dataCompetencia } })
    );
    const geradas = gerarParaRecorrencia(rec, dia, chavesExistentes());
    const salvo = await D.gravar(['recorrencias', 'lancamentos']);
    return { salvo: salvo, geradas: geradas };
  }

  // RF-15: altera o modelo. O que já foi pago/recebido e o que ficou no passado não muda.
  // dados: { descricao, valor, categoriaId, contaId, dataFim, aplicarPendentes }.
  // Devolve { salvo, atualizadas, geradas }.
  async function editar(id, dados, hoje) {
    const dia = hoje || U.hojeISO();
    const rec = obter(id);
    if (!rec) throw new Erro('Recorrência não encontrada.');
    const n = App.lancamentos.validarNucleo(rec.modelo.tipo, dados, { contaId: rec.modelo.contaId });
    const ag = validarAgenda({
      periodicidade: rec.periodicidade,
      intervaloDias: rec.intervaloDias,
      dataInicio: rec.dataInicio,
      dataFim: dados.dataFim,
    });

    Object.assign(rec.modelo, { descricao: n.descricao, valor: dados.valor, categoriaId: n.categoria.id, contaId: n.conta.id });
    rec.dataFim = ag.dataFim;
    rec.alteradoEm = U.agoraISO();

    // Atualiza as pendentes já geradas de hoje em diante, menos as que o usuário editou à mão.
    let atualizadas = 0;
    if (dados.aplicarPendentes) {
      D.registros('lancamentos').forEach(function (l) {
        if (!l.origem || l.origem.recorrenciaId !== id) return;
        if (l.situacao !== 'pendente' || l.origem.personalizada || l.dataCompetencia < dia) return;
        l.descricao = rec.modelo.descricao;
        l.valor = rec.modelo.valor;
        l.categoriaId = rec.modelo.categoriaId;
        l.contaId = rec.modelo.contaId;
        l.alteradoEm = rec.alteradoEm;
        atualizadas++;
      });
    }
    const geradas = rec.ativa && podeGerar(rec) ? gerarParaRecorrencia(rec, dia, chavesExistentes()) : 0;
    const salvo = await D.gravar(['recorrencias', 'lancamentos']);
    return { salvo: salvo, atualizadas: atualizadas, geradas: geradas };
  }

  // Pausa ou retoma. Ao retomar, o que ficou no passado durante a pausa não é gerado.
  async function definirAtiva(id, ativa, hoje) {
    const dia = hoje || U.hojeISO();
    const rec = obter(id);
    if (!rec) throw new Erro('Recorrência não encontrada.');
    rec.ativa = !!ativa;
    rec.alteradoEm = U.agoraISO();
    let geradas = 0;
    if (rec.ativa) {
      const passadas = R.ocorrencias(rec, { depois: rec.ultimaGerada, ate: U.somarDias(dia, -1), maximo: 100000 });
      if (passadas.length) rec.ultimaGerada = passadas[passadas.length - 1];
      if (podeGerar(rec)) geradas = gerarParaRecorrencia(rec, dia, chavesExistentes());
    }
    const salvo = await D.gravar(['recorrencias', 'lancamentos']);
    return { salvo: salvo, geradas: geradas };
  }

  // Exclui o modelo. Os lançamentos já gerados continuam, sem vínculo com a recorrência;
  // se pedido, as pendentes de hoje em diante são apagadas. Devolve { salvo, apagadas }.
  async function excluir(id, opcoes, hoje) {
    const dia = hoje || U.hojeISO();
    const apagarFuturas = !!(opcoes && opcoes.apagarPendentesFuturas);
    const rec = obter(id);
    if (!rec) throw new Erro('Recorrência não encontrada.');
    const lista = D.registros('lancamentos');
    const agora = U.agoraISO();
    let apagadas = 0;
    for (let i = lista.length - 1; i >= 0; i--) {
      const l = lista[i];
      if (!l.origem || l.origem.recorrenciaId !== id) continue;
      if (apagarFuturas && l.situacao === 'pendente' && l.dataCompetencia >= dia) {
        lista.splice(i, 1);
        apagadas++;
      } else {
        l.recorrenciaId = null;
        l.origem = null;
        l.alteradoEm = agora;
      }
    }
    const modelos = D.registros('recorrencias');
    modelos.splice(modelos.indexOf(rec), 1);
    const salvo = await D.gravar(['recorrencias', 'lancamentos']);
    return { salvo: salvo, apagadas: apagadas };
  }

  // Marca a ocorrência como "editada à mão" quando difere do modelo; essas não são
  // atualizadas quando o modelo muda. Chamada por lancamentos.editarMovimento.
  function avaliarPersonalizada(lancamento) {
    const origem = lancamento.origem;
    if (!origem || !origem.recorrenciaId) return;
    const rec = obter(origem.recorrenciaId);
    if (!rec) return;
    const m = rec.modelo;
    origem.personalizada =
      lancamento.descricao !== m.descricao ||
      lancamento.valor !== m.valor ||
      lancamento.categoriaId !== m.categoriaId ||
      lancamento.contaId !== m.contaId;
  }

  App.recorrencias = {
    LIMITE_NA_CRIACAO: LIMITE_NA_CRIACAO,
    listar: listar,
    obter: obter,
    podeGerar: podeGerar,
    gerarPendentes: gerarPendentes,
    criarDoFormulario: criarDoFormulario,
    editar: editar,
    definirAtiva: definirAtiva,
    excluir: excluir,
    avaliarPersonalizada: avaliarPersonalizada,
  };
})();
