/* Painel de recorrências da tela Configurações (RF-13 a RF-15): lista os modelos e permite
   editar, pausar/retomar e excluir. As recorrências nascem no formulário de Entradas e Saídas
   (opção "Repetir este lançamento").

   Cada ação devolve false quando nada foi gravado (cancelou ou a pasta não respondeu). */
(function () {
  'use strict';

  const U = App.util;
  const F = App.formulario;
  const esc = U.escaparHtml;
  const R = App.calc.recorrencias;

  function botao(acao, id, icone, rotulo) {
    return (
      '<button type="button" class="botao-icone botao-icone--plano" data-acao="' + acao + '" data-id="' + esc(id) +
      '" title="' + esc(rotulo) + '" aria-label="' + esc(rotulo) + '"><span class="icone" aria-hidden="true">' + icone + '</span></button>'
    );
  }

  function situacao(rec) {
    if (!rec.ativa) return '<span class="etiqueta">Pausada</span>';
    if (!App.recorrencias.podeGerar(rec)) {
      return '<span class="etiqueta etiqueta--alerta" title="A conta está inativa; nada é gerado até reativá-la.">Conta inativa</span>';
    }
    return '<span class="etiqueta etiqueta--sucesso">Ativa</span>';
  }

  function html() {
    const lista = App.recorrencias.listar();
    let corpo;
    if (!lista.length) {
      corpo =
        '<p class="vazio">Nenhuma recorrência ainda. Para criar uma, marque "Repetir este lançamento" ao registrar uma entrada ou saída.</p>';
    } else {
      const linhas = lista.map(function (rec) {
        const m = rec.modelo;
        return (
          '<tr class="' + (rec.ativa ? '' : 'inativa') + '">' +
          '<td><strong>' + esc(m.descricao) + '</strong></td>' +
          '<td>' + (m.tipo === 'receita' ? 'Entrada' : 'Saída') + '</td>' +
          '<td class="numero">' + U.formatarMoeda(m.valor) + '</td>' +
          '<td>' + esc(R.descricaoRepeticao(rec)) + '</td>' +
          '<td>' + U.formatarData(rec.dataInicio) + '</td>' +
          '<td>' + (rec.dataFim ? U.formatarData(rec.dataFim) : 'Sem fim') + '</td>' +
          '<td>' + (rec.ultimaGerada ? U.formatarData(rec.ultimaGerada) : '—') + '</td>' +
          '<td>' + situacao(rec) + '</td>' +
          '<td class="tabela__acoes">' +
          botao('editar-recorrencia', rec.id, 'edit', 'Editar recorrência') +
          botao('alternar-recorrencia', rec.id, rec.ativa ? 'pause_circle' : 'play_circle', rec.ativa ? 'Pausar recorrência' : 'Retomar recorrência') +
          botao('excluir-recorrencia', rec.id, 'delete', 'Excluir recorrência') +
          '</td></tr>'
        );
      }).join('');
      corpo =
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr>' +
        '<th>Descrição</th><th>Tipo</th><th class="numero">Valor</th><th>Repetição</th><th>Início</th><th>Fim</th><th>Gerada até</th><th>Situação</th><th></th>' +
        '</tr></thead><tbody>' + linhas + '</tbody></table></div>';
    }
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>Recorrências</h2>' +
      '<p class="texto-secundario">Lançamentos que se repetem, como aluguel e assinaturas. As ocorrências são geradas como pendentes até o fim do mês seguinte, sempre que você abre o programa.</p></div></div>' +
      corpo + '</section>'
    );
  }

  /* ---------- Editar o modelo (RF-15) ---------- */

  function editar(id) {
    const rec = App.recorrencias.obter(id);
    const m = rec.modelo;
    const natureza = App.lancamentos.MOVIMENTOS[m.tipo].natureza;
    const contas = App.contas.listar()
      .filter(function (c) { return c.ativa || c.id === m.contaId; })
      .map(function (c) { return { valor: c.id, rotulo: c.nome + (c.ativa ? '' : ' (inativa)') }; });
    const categorias = App.categorias.listar(natureza).map(function (c) { return { valor: c.id, rotulo: c.nome }; });

    return App.modal.abrir({
      titulo: 'Editar recorrência',
      corpo:
        '<p class="texto-secundario">' + esc(R.descricaoRepeticao(rec)) + ', desde ' + U.formatarData(rec.dataInicio) +
        '. A periodicidade e a data inicial não mudam depois de criada; para mudar o ritmo, defina uma data final aqui e crie uma nova recorrência.</p>' +
        F.grade(
          F.campo({ nome: 'descricao', rotulo: 'Descrição', valor: m.descricao, obrigatorio: true, maxlength: 120, inteiro: true }) +
            F.campo({ nome: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', valor: m.valor, obrigatorio: true }) +
            F.campo({ nome: 'contaId', rotulo: 'Conta', tipo: 'select', opcoes: contas, valor: m.contaId, obrigatorio: true }) +
            F.campo({ nome: 'categoriaId', rotulo: 'Categoria', tipo: 'select', opcoes: categorias, valor: m.categoriaId, obrigatorio: true }) +
            F.campo({ nome: 'dataFim', rotulo: 'Repetir até (opcional)', tipo: 'data', valor: rec.dataFim || '' }) +
            F.campo({
              nome: 'aplicarPendentes', tipo: 'caixa', valor: true, inteiro: true,
              rotulo: 'Atualizar também as ocorrências pendentes já geradas, de hoje em diante',
              dica: 'Ocorrências pagas, recebidas, do passado ou editadas individualmente não mudam.',
            })
        ),
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const valor = U.paraCentavos(v.valor);
        if (valor === null) throw new App.ErroValidacao('Informe um valor válido, como 150,00.');
        const r = await App.recorrencias.editar(id, {
          descricao: v.descricao,
          valor: valor,
          categoriaId: v.categoriaId,
          contaId: v.contaId,
          dataFim: v.dataFim,
          aplicarPendentes: v.aplicarPendentes,
        });
        if (r.salvo) {
          const partes = [];
          if (r.atualizadas) partes.push(r.atualizadas + ' ocorrência(s) pendente(s) atualizada(s)');
          if (r.geradas) partes.push(r.geradas + ' nova(s) gerada(s)');
          App.aviso.sucesso('Recorrência atualizada' + (partes.length ? ': ' + partes.join(', ') : '') + '.');
        }
        return r.salvo;
      },
    });
  }

  async function alternar(id) {
    const rec = App.recorrencias.obter(id);
    const r = await App.recorrencias.definirAtiva(id, !rec.ativa);
    if (r.salvo) {
      App.aviso.sucesso(rec.ativa ? 'Recorrência retomada.' + (r.geradas ? ' ' + r.geradas + ' ocorrência(s) gerada(s).' : '') : 'Recorrência pausada. Nada novo será gerado até retomá-la.');
    }
    return r.salvo;
  }

  function excluir(id) {
    const rec = App.recorrencias.obter(id);
    return App.modal.abrir({
      titulo: 'Excluir recorrência',
      rotuloSalvar: 'Excluir',
      perigo: true,
      corpo:
        '<p>Excluir a recorrência <strong>' + esc(rec.modelo.descricao) + '</strong>? Os lançamentos já gerados continuam nas telas de Entradas e Saídas, sem vínculo com a recorrência.</p>' +
        F.campo({
          nome: 'apagarPendentesFuturas', tipo: 'caixa', valor: true,
          rotulo: 'Apagar também as ocorrências pendentes de hoje em diante',
        }),
      aoSalvar: async function (form) {
        const r = await App.recorrencias.excluir(id, { apagarPendentesFuturas: F.valores(form).apagarPendentesFuturas });
        if (r.salvo) App.aviso.sucesso('Recorrência excluída.' + (r.apagadas ? ' ' + r.apagadas + ' ocorrência(s) pendente(s) apagada(s).' : ''));
        return r.salvo;
      },
    });
  }

  App.telas = App.telas || {};
  App.telas.recorrencias = { html: html, editar: editar, alternar: alternar, excluir: excluir };
})();
