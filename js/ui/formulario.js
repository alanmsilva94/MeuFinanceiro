/* Campos de formulário padronizados (rótulo, controle e dica).
   Uso: App.formulario.grade(App.formulario.campo({ nome: 'nome', rotulo: 'Nome', obrigatorio: true }) + ...)
   Tipos: texto (padrão), moeda, data, select, textarea, cor.
   Em "moeda", o valor entra em centavos e sai como texto; converta com App.util.paraCentavos. */
(function () {
  'use strict';

  const U = App.util;
  const esc = U.escaparHtml;
  let contador = 0;

  function campo(o) {
    const id = 'campo-' + o.nome + '-' + ++contador;
    const valor = o.valor === undefined || o.valor === null ? '' : o.valor;
    const comum =
      ' id="' + id + '" name="' + esc(o.nome) + '"' +
      (o.obrigatorio ? ' required' : '') +
      (o.desabilitado ? ' disabled' : '');
    let controle;

    // Caixa de seleção: o texto fica ao lado da caixa, sem rótulo em cima.
    if (o.tipo === 'caixa') {
      return (
        '<div class="campo' + (o.inteiro ? ' campo--inteiro' : '') + (o.classe ? ' ' + o.classe : '') + '">' +
        '<label class="campo__caixa" for="' + id + '"><input type="checkbox"' + comum + ' value="1"' + (o.valor ? ' checked' : '') + '>' +
        '<span>' + esc(o.rotulo) + '</span></label>' +
        (o.dica ? '<span class="campo__dica">' + esc(o.dica) + '</span>' : '') +
        '</div>'
      );
    }

    switch (o.tipo || 'texto') {
      case 'select':
        controle =
          '<select' + comum + '>' +
          (o.opcoes || [])
            .map(function (op) {
              return (
                '<option value="' + esc(op.valor) + '"' +
                (String(op.valor) === String(valor) ? ' selected' : '') + '>' + esc(op.rotulo) + '</option>'
              );
            })
            .join('') +
          '</select>';
        break;
      case 'textarea':
        controle = '<textarea' + comum + ' rows="3" maxlength="' + (o.maxlength || 300) + '">' + esc(valor) + '</textarea>';
        break;
      case 'data':
        controle = '<input type="date"' + comum + ' value="' + esc(valor) + '">';
        break;
      case 'mes':
        controle = '<input type="month"' + comum + ' value="' + esc(valor) + '">';
        break;
      case 'cor':
        controle = '<input type="color"' + comum + ' value="' + esc(valor || '#1d4ed8') + '">';
        break;
      case 'numero':
        controle = '<input type="number" inputmode="numeric" min="1" step="1"' + comum + ' value="' + esc(valor) + '">';
        break;
      case 'moeda':
        controle =
          '<input type="text" inputmode="decimal" autocomplete="off" placeholder="0,00"' + comum +
          ' value="' + esc(Number.isSafeInteger(valor) ? U.centavosParaCampo(valor) : valor) + '">';
        break;
      default:
        controle =
          '<input type="text" autocomplete="off"' + comum +
          ' maxlength="' + (o.maxlength || 100) + '" value="' + esc(valor) + '">';
    }

    return (
      '<div class="campo' + (o.inteiro ? ' campo--inteiro' : '') + (o.classe ? ' ' + o.classe : '') + '">' +
      '<label class="campo__rotulo" for="' + id + '">' + esc(o.rotulo) +
      (o.obrigatorio ? ' <span class="campo__obrigatorio" aria-hidden="true">*</span>' : '') + '</label>' +
      controle +
      (o.dica ? '<span class="campo__dica">' + esc(o.dica) + '</span>' : '') +
      '</div>'
    );
  }

  // larga = true: 4 colunas (formulários no corpo da tela); senão 2 (janelas).
  function grade(html, larga) {
    return '<div class="formulario__grade' + (larga ? ' formulario__grade--larga' : '') + '">' + html + '</div>';
  }

  // Lê todos os campos com nome: { nome: texto }. Caixas de seleção viram true/false.
  function valores(form) {
    const resultado = {};
    Array.from(form.elements).forEach(function (el) {
      if (!el.name) return;
      resultado[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return resultado;
  }

  App.formulario = { campo: campo, grade: grade, valores: valores };
})();
