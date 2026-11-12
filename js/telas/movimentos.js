/* Fábrica das telas Entradas e Saídas (RF-08 a RF-12). As duas telas são iguais; só mudam
   os textos e o tipo de lançamento (receita ou despesa). Cada uma é registrada em
   entradas.js e saidas.js.

   Estrutura: formulário no topo, filtros, totais do período filtrado e tabela embaixo.
   O período dos filtros usa a data de competência e acompanha o mês do cabeçalho. */
(function () {
  'use strict';

  const U = App.util;
  const F = App.formulario;
  const esc = U.escaparHtml;

  function botaoLinha(acao, id, icone, rotulo) {
    return (
      '<button type="button" class="botao-icone botao-icone--plano" data-acao="' + acao + '" data-id="' + esc(id) +
      '" title="' + esc(rotulo) + '" aria-label="' + esc(rotulo) + '"><span class="icone" aria-hidden="true">' + icone + '</span></button>'
    );
  }

  function primeiroDia(mes) {
    return mes + '-01';
  }

  function ultimoDia(mes) {
    const [a, m] = mes.split('-').map(Number);
    return mes + '-' + String(U.ultimoDiaDoMes(a, m)).padStart(2, '0');
  }

  // Data padrão de um lançamento novo: hoje, se hoje estiver no mês do cabeçalho.
  function dataPadrao() {
    const hoje = U.hojeISO();
    return hoje.slice(0, 7) === App.estado.mes ? hoje : primeiroDia(App.estado.mes);
  }

  async function avisarErro(erro) {
    if (erro instanceof App.ErroValidacao) {
      App.aviso.alerta(erro.message);
    } else {
      console.error(erro);
      App.aviso.erro('Algo deu errado: ' + erro.message);
    }
  }

  function criarTela(cfg) {
    const mov = App.lancamentos.MOVIMENTOS[cfg.tipo];
    const estado = { mes: null, de: '', ate: '', categoriaId: '', contaId: '', situacao: '' };
    let editandoId = null;
    // Quando a tela é redesenhada por um motivo externo (troca de mês, por exemplo), o que está
    // digitado no formulário é mantido. Isto marca os casos em que o formulário deve, ao contrário,
    // voltar limpo ou trocar de conteúdo (salvou, começou a editar outro lançamento, cancelou).
    let descartarFormulario = false;

    // Ao sair da tela, descarta uma edição que ficou pela metade.
    App.eventos.on('rota:alterada', function (rota) {
      if (rota.nome !== cfg.nome) editandoId = null;
    });

    function sincronizarPeriodo() {
      if (estado.mes !== App.estado.mes) {
        estado.mes = App.estado.mes;
        estado.de = primeiroDia(estado.mes);
        estado.ate = ultimoDia(estado.mes);
      }
      // Filtro de categoria ou conta que foi excluída: sem isto o seletor mostra "Todas" mas o filtro continua ativo.
      if (estado.categoriaId && !App.categorias.obter(estado.categoriaId)) estado.categoriaId = '';
      if (estado.contaId && !App.contas.obter(estado.contaId)) estado.contaId = '';
    }

    /* ---------- Formulário ---------- */

    function opcoesContas(atual) {
      return App.contas
        .listar()
        .filter(function (c) {
          return c.ativa || (atual && atual.contaId === c.id);
        })
        .map(function (c) {
          return { valor: c.id, rotulo: c.nome + (c.ativa ? '' : ' (inativa)') };
        });
    }

    function htmlFormulario(atual) {
      const contas = opcoesContas(atual);
      const categorias = App.categorias.listar(mov.natureza).map(function (c) {
        return { valor: c.id, rotulo: c.nome };
      });
      const v = atual || {};
      const efetiva = v.situacao === mov.efetivada;

      // RF-13: repetição, só ao criar. Ao editar, mostra de qual recorrência o lançamento faz parte.
      let repeticao = '';
      let nota = '';
      if (!atual) {
        repeticao =
          '<div style="margin-top:var(--esp-3)">' +
          F.campo({ nome: 'repetir', rotulo: 'Repetir este lançamento', tipo: 'caixa' }) +
          '<div data-repeticao hidden style="margin-top:var(--esp-3)">' +
          F.grade(
            F.campo({
              nome: 'periodicidade', rotulo: 'Repete', tipo: 'select', valor: 'mensal',
              opcoes: Object.keys(App.calc.recorrencias.PERIODICIDADES).map(function (k) {
                return { valor: k, rotulo: App.calc.recorrencias.PERIODICIDADES[k] };
              }),
            }) +
              '<div data-intervalo hidden>' +
              F.campo({ nome: 'intervaloDias', rotulo: 'A cada quantos dias', tipo: 'numero', valor: '30' }) +
              '</div>' +
              F.campo({ nome: 'dataFim', rotulo: 'Repetir até (opcional)', tipo: 'data', dica: 'Em branco: sem data final.' }),
            true
          ) +
          '<p class="campo__dica" style="margin-top:var(--esp-2)">A data de competência acima é a da primeira ocorrência. ' +
          'As próximas são geradas como pendentes até o fim do mês seguinte, e novas são criadas sempre que você abre o programa.</p>' +
          '</div></div>';
      } else if (atual.recorrenciaId) {
        const rec = App.recorrencias.obter(atual.recorrenciaId);
        nota =
          '<p class="nota-info">Este lançamento faz parte de uma recorrência' +
          (rec ? ' (' + esc(App.calc.recorrencias.descricaoRepeticao(rec).toLowerCase()) + ')' : '') +
          '. A alteração vale só para ele. Para mudar os próximos, edite a recorrência em <a href="#configuracoes">Configurações</a>.</p>';
      }

      return (
        nota +
        '<form data-form data-editando="' + esc(atual ? atual.id : '') + '" novalidate>' +
        F.grade(
          F.campo({ nome: 'descricao', rotulo: 'Descrição', valor: v.descricao, obrigatorio: true, maxlength: 120, classe: 'campo--dobro' }) +
            F.campo({ nome: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', valor: v.valor === undefined ? '' : v.valor, obrigatorio: true }) +
            F.campo({ nome: 'contaId', rotulo: 'Conta', tipo: 'select', opcoes: contas, valor: v.contaId, obrigatorio: true }) +
            F.campo({ nome: 'categoriaId', rotulo: 'Categoria', tipo: 'select', opcoes: categorias, valor: v.categoriaId, obrigatorio: true }) +
            F.campo({ nome: 'dataCompetencia', rotulo: 'Data de competência', tipo: 'data', valor: v.dataCompetencia || dataPadrao(), obrigatorio: true }) +
            F.campo({ nome: 'dataVencimento', rotulo: cfg.rotuloVencimento, tipo: 'data', valor: v.dataVencimento || '' }) +
            F.campo({
              nome: 'situacao', rotulo: 'Situação', tipo: 'select', valor: v.situacao || 'pendente', obrigatorio: true,
              opcoes: [{ valor: 'pendente', rotulo: 'Pendente' }, { valor: mov.efetivada, rotulo: cfg.rotuloEfetivada }],
            }) +
            F.campo({ nome: 'dataPagamento', rotulo: cfg.rotuloDataEfetiva, tipo: 'data', valor: efetiva ? v.dataPagamento : '', desabilitado: !efetiva }) +
            F.campo({ nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', valor: v.observacao, classe: 'campo--triplo' }),
          true
        ) +
        repeticao +
        '<p class="formulario__erro" role="alert" hidden style="margin-top:var(--esp-3)"></p>' +
        '<div class="painel__acoes" style="margin-top:var(--esp-4)">' +
        '<button type="submit" class="botao botao--primario"><span class="icone" aria-hidden="true">' + (atual ? 'save' : 'add') + '</span>' +
        (atual ? 'Salvar alterações' : cfg.rotuloBotaoNovo) + '</button>' +
        (atual ? '<button type="button" class="botao botao--fantasma" data-acao="cancelar-edicao">Cancelar edição</button>' : '') +
        '</div></form>'
      );
    }

    function ligarFormulario(raiz) {
      const form = raiz.querySelector('[data-form]');
      if (!form) return;
      const situacao = form.elements.situacao;
      const dataEfetiva = form.elements.dataPagamento;
      const erro = form.querySelector('.formulario__erro');
      const botao = form.querySelector('[type="submit"]');

      // A data de pagamento/recebimento só vale quando a situação é pago/recebido.
      situacao.addEventListener('change', function () {
        const efetiva = situacao.value === mov.efetivada;
        dataEfetiva.disabled = !efetiva;
        if (!efetiva) dataEfetiva.value = '';
        else if (!dataEfetiva.value) dataEfetiva.value = U.hojeISO();
      });

      // Campos de repetição: aparecem só quando "Repetir" está marcado; o intervalo só para "A cada N dias".
      const repetir = form.elements.repetir;
      if (repetir) {
        const bloco = form.querySelector('[data-repeticao]');
        const blocoIntervalo = form.querySelector('[data-intervalo]');
        const atualizarRepeticao = function () {
          bloco.hidden = !repetir.checked;
          blocoIntervalo.hidden = form.elements.periodicidade.value !== 'dias';
        };
        repetir.addEventListener('change', atualizarRepeticao);
        form.elements.periodicidade.addEventListener('change', atualizarRepeticao);
        atualizarRepeticao();
      }

      form.addEventListener('submit', async function (evento) {
        evento.preventDefault();
        if (botao.disabled) return;
        botao.disabled = true;
        erro.hidden = true;
        try {
          const v = F.valores(form);
          const dados = {
            descricao: v.descricao,
            valor: U.paraCentavos(v.valor),
            categoriaId: v.categoriaId,
            contaId: v.contaId,
            dataCompetencia: v.dataCompetencia,
            dataVencimento: v.dataVencimento,
            situacao: v.situacao,
            dataPagamento: v.dataPagamento,
            observacao: v.observacao,
          };
          if (dados.valor === null) throw new App.ErroValidacao('Informe um valor válido, como 150,00.');
          let gravou;
          let mensagem = editandoId ? 'Alterações salvas.' : cfg.mensagemCriado;
          if (!editandoId && v.repetir) {
            const r = await App.recorrencias.criarDoFormulario(cfg.tipo, dados, {
              periodicidade: v.periodicidade,
              intervaloDias: v.intervaloDias,
              dataFim: v.dataFim,
            });
            gravou = r.salvo;
            mensagem += r.geradas ? ' Recorrência criada: ' + r.geradas + ' ocorrência(s) futura(s) gerada(s).' : ' Recorrência criada.';
          } else if (editandoId) {
            gravou = await App.lancamentos.editarMovimento(editandoId, dados);
          } else {
            gravou = await App.lancamentos.criarMovimento(cfg.tipo, dados);
          }
          if (gravou !== false) App.aviso.sucesso(mensagem);
          editandoId = null;
          descartarFormulario = true;
          App.roteador.renderizar();
          const campo = document.querySelector('[data-tela="' + cfg.nome + '"] [name="descricao"]');
          if (campo) campo.focus();
        } catch (e) {
          if (e instanceof App.ErroValidacao) {
            erro.textContent = e.message;
            erro.hidden = false;
          } else {
            console.error(e);
            erro.textContent = 'Algo deu errado: ' + e.message;
            erro.hidden = false;
          }
          if (botao.isConnected) botao.disabled = false;
        }
      });
    }

    /* ---------- Filtros, totais e tabela ---------- */

    function htmlFiltros() {
      const categorias = [{ valor: '', rotulo: 'Todas' }].concat(
        App.categorias.listar(mov.natureza).map(function (c) { return { valor: c.id, rotulo: c.nome }; })
      );
      const contas = [{ valor: '', rotulo: 'Todas' }].concat(
        App.contas.listar().map(function (c) { return { valor: c.id, rotulo: c.nome + (c.ativa ? '' : ' (inativa)') }; })
      );
      const situacoes = [
        { valor: '', rotulo: 'Todas' },
        { valor: 'pendente', rotulo: 'Pendente' },
        { valor: mov.efetivada, rotulo: cfg.rotuloEfetivada },
      ];
      return (
        '<div class="filtros" data-filtros>' +
        F.campo({ nome: 'de', rotulo: 'De (competência)', tipo: 'data', valor: estado.de }) +
        F.campo({ nome: 'ate', rotulo: 'Até', tipo: 'data', valor: estado.ate }) +
        F.campo({ nome: 'categoriaId', rotulo: 'Categoria', tipo: 'select', opcoes: categorias, valor: estado.categoriaId }) +
        F.campo({ nome: 'contaId', rotulo: 'Conta', tipo: 'select', opcoes: contas, valor: estado.contaId }) +
        F.campo({ nome: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: situacoes, valor: estado.situacao }) +
        '</div>'
      );
    }

    function htmlResultados() {
      if (estado.de && estado.ate && estado.de > estado.ate) {
        return '<p class="vazio">A data inicial do período é posterior à data final.</p>';
      }
      const lista = App.lancamentos.listarMovimentos(cfg.tipo, estado);
      const totais = App.calc.totaisPorSituacao(lista);
      const classeRealizado = cfg.tipo === 'receita' ? 'valor-positivo' : 'valor-negativo';

      const resumo =
        '<div class="totais">' +
        '<div class="total-item"><span class="total-item__rotulo">' + cfg.rotuloTotalRealizado + '</span>' +
        '<span class="total-item__valor ' + classeRealizado + '">' + U.formatarMoeda(totais.realizado) + '</span></div>' +
        '<div class="total-item"><span class="total-item__rotulo">' + cfg.rotuloTotalPendente + '</span>' +
        '<span class="total-item__valor valor-pendente">' + U.formatarMoeda(totais.pendente) + '</span></div>' +
        '<div class="total-item"><span class="total-item__rotulo">Total do período (' + totais.quantidade + ')</span>' +
        '<span class="total-item__valor">' + U.formatarMoeda(totais.total) + '</span></div>' +
        '</div>';

      if (!lista.length) {
        return resumo + '<p class="vazio">Nenhum lançamento encontrado com esses filtros.</p>';
      }

      const linhas = lista
        .map(function (l) {
          const categoria = App.categorias.obter(l.categoriaId);
          const conta = App.contas.obter(l.contaId);
          const efetivada = l.situacao === mov.efetivada;
          return (
            '<tr>' +
            '<td>' + U.formatarData(l.dataCompetencia) + '</td>' +
            '<td class="descricao" title="' + esc(l.observacao || l.descricao) + '">' +
            (l.recorrenciaId ? '<span class="icone icone--pequeno" title="Faz parte de uma recorrência" aria-label="Recorrência">repeat</span>' : '') +
            '<strong>' + esc(l.descricao) + '</strong></td>' +
            '<td>' + (categoria ? '<span class="cor-ponto" style="background:' + U.corSegura(categoria.cor) + '"></span>' + esc(categoria.nome) : '—') + '</td>' +
            '<td>' + (conta ? esc(conta.nome) : '—') + '</td>' +
            '<td>' + (l.dataVencimento ? U.formatarData(l.dataVencimento) : '—') + '</td>' +
            '<td>' + (l.dataPagamento ? U.formatarData(l.dataPagamento) : '—') + '</td>' +
            '<td class="numero">' + U.formatarMoeda(l.valor) + '</td>' +
            '<td>' + (efetivada
              ? '<span class="etiqueta etiqueta--sucesso">' + cfg.rotuloEfetivada + '</span>'
              : '<span class="etiqueta etiqueta--alerta">Pendente</span>') + '</td>' +
            '<td class="tabela__acoes">' +
            (l.origem && l.origem.investimentoId
              ? '<span class="icone icone--pequeno" title="Gerado na tela Investimentos: altere por lá" aria-label="Gerado pelos investimentos">lock</span>'
              : (efetivada
                  ? botaoLinha('desfazer', l.id, 'undo', 'Voltar para pendente')
                  : botaoLinha('efetivar', l.id, 'check_circle', cfg.rotuloMarcar)) +
                botaoLinha('editar', l.id, 'edit', 'Editar') +
                botaoLinha('excluir', l.id, 'delete', 'Excluir')) +
            '</td></tr>'
          );
        })
        .join('');

      return (
        resumo +
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr>' +
        '<th>Competência</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th>' + cfg.rotuloVencimento + '</th>' +
        '<th>' + cfg.rotuloDataEfetiva + '</th><th class="numero">Valor</th><th>Situação</th><th></th>' +
        '</tr></thead><tbody>' + linhas + '</tbody></table></div>'
      );
    }

    function desenharResultados(raiz) {
      raiz.querySelector('[data-resultados]').innerHTML = htmlResultados();
    }

    /* ---------- Ações da tabela ---------- */

    async function pedirData(titulo, rotulo) {
      let data = null;
      const salvou = await App.modal.abrir({
        titulo: titulo,
        rotuloSalvar: 'Confirmar',
        corpo: F.campo({ nome: 'data', rotulo: rotulo, tipo: 'data', valor: U.hojeISO(), obrigatorio: true }),
        aoSalvar: async function (form) {
          data = F.valores(form).data;
          if (!U.ehDataISO(data)) throw new App.ErroValidacao('Informe a data.');
        },
      });
      return salvou ? data : null;
    }

    const ACOES = {
      efetivar: async function (id) {
        const data = await pedirData(cfg.rotuloMarcar, cfg.rotuloDataEfetiva);
        if (!data) return;
        const gravou = await App.lancamentos.efetivar(id, data);
        if (gravou !== false) App.aviso.sucesso(cfg.mensagemEfetivado);
      },
      desfazer: async function (id) {
        const gravou = await App.lancamentos.desfazerEfetivacao(id);
        if (gravou !== false) App.aviso.info('Lançamento voltou para pendente.');
      },
      editar: function (id) {
        editandoId = id;
        descartarFormulario = true;
        App.roteador.renderizar();
        const campo = document.querySelector('[data-tela="' + cfg.nome + '"] [name="descricao"]');
        window.scrollTo(0, 0);
        if (campo) campo.focus();
        return 'sem-renderizar';
      },
      'cancelar-edicao': function () {
        editandoId = null;
        descartarFormulario = true;
      },
      excluir: async function (id) {
        const l = App.lancamentos.obterMovimento(id);
        const confirmou = await App.modal.confirmar({
          titulo: 'Excluir lançamento',
          mensagem:
            'Excluir "' + l.descricao + '" de ' + U.formatarMoeda(l.valor) + '? ' +
            (App.calc.realizado(l) ? 'O saldo da conta será recalculado. ' : '') +
            (l.recorrenciaId ? 'Só esta ocorrência é excluída; a recorrência continua. ' : '') +
            'Isso não pode ser desfeito.',
          rotuloConfirmar: 'Excluir',
          perigo: true,
        });
        if (!confirmou) return;
        const gravou = await App.lancamentos.excluirMovimento(id);
        if (editandoId === id) {
          editandoId = null;
          descartarFormulario = true;
        }
        if (gravou !== false) App.aviso.sucesso('Lançamento excluído.');
      },
    };

    /* ---------- Tela ---------- */

    // Devolve ao formulário o que estava digitado antes do redesenho.
    function restaurarFormulario(raiz, valores) {
      const form = raiz.querySelector('[data-form]');
      if (!form) return;
      Object.keys(valores).forEach(function (nome) {
        const campo = form.elements[nome];
        if (!campo) return;
        if (campo.type === 'checkbox') campo.checked = !!valores[nome];
        else campo.value = valores[nome];
      });
      // Reaplica o que depende de situação e repetição (data efetiva habilitada, campos de repetição visíveis).
      ['situacao', 'repetir', 'periodicidade'].forEach(function (nome) {
        if (form.elements[nome]) form.elements[nome].dispatchEvent(new Event('change'));
      });
    }

    function render(elemento) {
      // O que está digitado só é mantido se for o mesmo formulário (novo, ou a mesma edição).
      const formAnterior = elemento.querySelector('[data-tela="' + cfg.nome + '"] [data-form]');
      const guardado =
        !descartarFormulario && formAnterior && formAnterior.dataset.editando === (editandoId || '') ? F.valores(formAnterior) : null;
      descartarFormulario = false;

      sincronizarPeriodo();
      const contas = opcoesContas(null);
      const categorias = App.categorias.listar(mov.natureza);
      const atual = editandoId ? App.lancamentos.obterMovimento(editandoId) : null;
      if (editandoId && !atual) editandoId = null;

      let blocoFormulario;
      if (!contas.length) {
        blocoFormulario = '<p class="vazio">Para registrar ' + cfg.plural + ', cadastre antes uma conta em <a href="#contas">Contas</a>.</p>';
      } else if (!categorias.length) {
        blocoFormulario = '<p class="vazio">Não há categorias de ' + mov.natureza + '. Cadastre uma em <a href="#configuracoes">Configurações</a>.</p>';
      } else {
        blocoFormulario = htmlFormulario(atual);
      }

      elemento.innerHTML =
        '<div data-tela="' + cfg.nome + '">' +
        '<section class="painel"><div class="painel__topo"><div><h2>' + (atual ? cfg.tituloEdicao : cfg.tituloNovo) + '</h2>' +
        '<p class="texto-secundario">' + cfg.descricaoFormulario + '</p></div></div>' + blocoFormulario + '</section>' +
        '<section class="painel"><div class="painel__topo"><div><h2>' + cfg.titulo + '</h2>' +
        '<p class="texto-secundario">O período usa a data de competência e acompanha o mês escolhido no cabeçalho.</p></div>' +
        '<button type="button" class="botao botao--fantasma botao--pequeno" data-acao="limpar-filtros">Limpar filtros</button></div>' +
        htmlFiltros() + '<div data-resultados></div></section></div>';

      const raiz = elemento.firstElementChild;
      desenharResultados(raiz);
      ligarFormulario(raiz);
      if (guardado) restaurarFormulario(raiz, guardado);

      // Mudar um filtro redesenha só a tabela, para não perder o que está sendo digitado no formulário.
      raiz.querySelector('[data-filtros]').addEventListener('change', function (evento) {
        const campo = evento.target;
        if (!campo.name || !(campo.name in { de: 1, ate: 1, categoriaId: 1, contaId: 1, situacao: 1 })) return;
        estado[campo.name] = campo.value;
        desenharResultados(raiz);
      });

      // A raiz é recriada a cada desenho, então este ouvinte não se acumula.
      raiz.addEventListener('click', async function (evento) {
        const alvo = evento.target.closest('[data-acao]');
        if (!alvo || alvo.disabled) return;
        const acao = alvo.dataset.acao;
        if (acao === 'limpar-filtros') {
          estado.mes = null;
          estado.categoriaId = estado.contaId = estado.situacao = '';
          App.roteador.renderizar();
          return;
        }
        const tratar = ACOES[acao];
        if (!tratar) return;
        // Marcar como pago, desfazer e excluir só mudam a tabela: o formulário (e o que já foi
        // digitado nele) fica como está. Se a ação mexeu na edição em curso, aí sim redesenha tudo.
        const soTabela = acao === 'efetivar' || acao === 'desfazer' || acao === 'excluir';
        const editandoAntes = editandoId;
        const atualizar = function () {
          if (soTabela && editandoId === editandoAntes && raiz.isConnected) desenharResultados(raiz);
          else App.roteador.renderizar();
        };
        try {
          const resultado = await tratar(alvo.dataset.id);
          if (resultado !== 'sem-renderizar') atualizar();
        } catch (erro) {
          await avisarErro(erro);
          atualizar();
        }
      });
    }

    App.roteador.registrar(cfg.nome, { titulo: cfg.titulo, icone: cfg.icone, menu: true, ordem: cfg.ordem, render: render });
  }

  App.telas = App.telas || {};
  App.telas.criarMovimentos = criarTela;
})();
