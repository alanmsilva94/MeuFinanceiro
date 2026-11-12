/* Backup e restauração (RF-39, RF-40; seção 3.6 da especificação).

   Backup automático
   - Depois das alterações gravadas, espera alguns segundos de sossego e copia todos os JSON para
     uma subpasta datada de `backups/` (AAAA-MM-DD_HH-MM, na pasta de dados). Para não encher a
     pasta (e o Google Drive) de cópias, há um intervalo mínimo entre cópias automáticas (padrão 10
     minutos, configurável): as alterações feitas nesse intervalo entram juntas na próxima cópia,
     e uma cópia idêntica à anterior nem é gravada.
   - Se a aba for escondida ou fechada com alteração ainda sem cópia, a cópia é feita na hora.
   - Ao abrir o programa, garante que existe ao menos uma cópia do dia.
   - Retenção: ficam as N cópias mais recentes (padrão 30, configurável) e, além delas, a última
     cópia de cada um dos últimos 30 dias. Cópias com nome especial (como as de "antes de
     restaurar") nunca são apagadas sozinhas.
   - Uma falha no backup nunca impede a gravação dos dados: só avisa.

   Backup manual
   - Um arquivo único com todos os dados, para guardar fora da pasta de dados (e do Google Drive).

   Restauração
   - Aceita uma cópia da pasta backups/ ou um arquivo único. Confere o conteúdo inteiro antes de
     tocar em qualquer coisa, guarda uma cópia de segurança do estado atual e só então troca os dados. */
(function () {
  'use strict';

  const U = App.util;
  const Erro = App.ErroValidacao;

  const FORMATO = 'meufinanceiro-backup';
  const VERSAO_DO_ARQUIVO = 1;
  const PADRAO_AUTOMATICO = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/;
  const PADRAO_NOME = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})(?:_(.+))?$/;
  const ESPERA_MS = 5000;
  const INTERVALO_PADRAO_MIN = 10;
  const INTERVALO_AO_ESCONDER_MS = 2 * 60 * 1000; // ao esconder a aba, só copia se a última cópia tem mais que isto
  const DIAS_DE_HISTORICO = 30;
  const MANTIDOS_PADRAO = 30;
  const SUFIXO_RESTAURAR = 'antes-de-restaurar';

  const estado = {
    ultimo: null, // a última cópia gravada, de qualquer tipo
    ultimaDoEstado: 0, // quando foi a última cópia do estado (automática ou manual), para o intervalo mínimo
    assinatura: null, // o conteúdo da última cópia, para não gravar uma idêntica
    falha: null,
    emAndamento: false,
    pendente: false,
    agendado: false,
    timer: null,
  };

  function doisDigitos(n) {
    return String(n).padStart(2, '0');
  }

  /* ---------- Nomes e retenção (funções puras) ---------- */

  // 2026-11-10 14:32 -> "2026-11-10_14-32" (com sufixo opcional: "..._antes-de-restaurar").
  function nomeDaCopia(data, sufixo) {
    const d = data || new Date();
    return (
      d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate()) + '_' +
      doisDigitos(d.getHours()) + '-' + doisDigitos(d.getMinutes()) + (sufixo ? '_' + sufixo : '')
    );
  }

  function interpretarNome(nome) {
    const m = PADRAO_NOME.exec(nome);
    if (!m) return null;
    return {
      nome: nome,
      data: m[1] + '-' + m[2] + '-' + m[3],
      hora: m[4] + ':' + m[5],
      sufixo: m[6] || '',
      automatico: !m[6],
    };
  }

  // Quais cópias automáticas apagar: mantém as `mantidos` mais recentes e a última de cada dia
  // dos últimos `dias` dias. Nomes fora do padrão automático nunca entram na lista.
  function selecionarParaApagar(nomes, hojeISO, mantidos, dias) {
    const automaticos = nomes.filter(function (n) { return PADRAO_AUTOMATICO.test(n); }).sort().reverse();
    const manter = new Set(automaticos.slice(0, mantidos));
    const limite = U.somarDias(hojeISO, -dias);
    const dias_vistos = new Set();
    automaticos.forEach(function (n) {
      const dia = n.slice(0, 10);
      if (dia >= limite && !dias_vistos.has(dia)) {
        dias_vistos.add(dia);
        manter.add(n);
      }
    });
    return automaticos.filter(function (n) { return !manter.has(n); });
  }

  // Quanto esperar antes da próxima cópia automática: o sossego de alguns segundos, mas nunca
  // antes de passar o intervalo mínimo desde a última cópia do estado.
  function atrasoDoProximoBackup(agoraMs, ultimaCopiaMs, intervaloMs) {
    if (!ultimaCopiaMs) return ESPERA_MS;
    return Math.max(ESPERA_MS, ultimaCopiaMs + intervaloMs - agoraMs);
  }

  function intervaloMinutos() {
    const config = App.storage.obter('config');
    const n = Number(config && config.preferencias && config.preferencias.backupIntervaloMinutos);
    return Number.isInteger(n) && n >= 1 ? Math.min(n, 240) : INTERVALO_PADRAO_MIN;
  }

  function copiasMantidas() {
    const config = App.storage.obter('config');
    const n = Number(config && config.preferencias && config.preferencias.backupsMantidos);
    return Number.isInteger(n) && n >= 1 ? Math.min(n, 500) : MANTIDOS_PADRAO;
  }

  /* ---------- Conteúdo ---------- */

  function conteudoAtual() {
    const c = {};
    App.storage.ARQUIVOS.forEach(function (nome) {
      c[nome] = App.storage.obter(nome);
    });
    return c;
  }

  // Confere o conjunto inteiro (um objeto por arquivo de dados) antes de usá-lo.
  function validarConjunto(conjunto) {
    if (!conjunto || typeof conjunto !== 'object') throw new Erro('O backup não tem o formato esperado.');
    App.storage.ARQUIVOS.forEach(function (nome) {
      const obj = conjunto[nome];
      const arquivo = nome + '.json';
      if (!obj) throw new Erro('O backup está incompleto: falta o conteúdo de ' + arquivo + '.');
      if (typeof obj !== 'object' || Array.isArray(obj)) throw new Erro('O conteúdo de ' + arquivo + ' no backup não tem o formato esperado.');
      if (!Number.isInteger(obj.versao)) throw new Erro('O conteúdo de ' + arquivo + ' no backup não informa a versão do formato.');
      if (obj.versao > App.storage.VERSAO_FORMATO) {
        throw new Erro('Este backup foi criado por uma versão mais nova do MeuFinanceiro (' + arquivo + '). Atualize a aplicação antes de restaurá-lo.');
      }
      if (nome !== 'config' && !Array.isArray(obj.registros)) throw new Erro('O conteúdo de ' + arquivo + ' no backup não tem a lista de registros.');
    });
    return conjunto;
  }

  // Quantos registros há em cada arquivo, para mostrar antes de restaurar.
  function resumo(conjunto) {
    const r = {};
    App.storage.ARQUIVOS.forEach(function (nome) {
      if (nome !== 'config') r[nome] = conjunto[nome].registros.length;
    });
    return r;
  }

  /* ---------- Cópias na pasta backups/ ---------- */

  async function pastaDeBackups(criar) {
    return App.storage.pasta().getDirectoryHandle('backups', { create: !!criar });
  }

  async function existePasta(raiz, nome) {
    try {
      await raiz.getDirectoryHandle(nome);
      return true;
    } catch (erro) {
      return false;
    }
  }

  // Cria a cópia (ou atualiza a do mesmo minuto). Os textos são montados antes de escrever,
  // para os arquivos da cópia serem de um mesmo instante mesmo que haja alterações no meio.
  // `forcar` grava mesmo que o conteúdo seja igual ao da última cópia (cópia pedida pelo usuário).
  async function criarCopia(sufixo, forcar) {
    const textos = {};
    const dados = conteudoAtual();
    Object.keys(dados).forEach(function (nome) {
      textos[nome] = JSON.stringify(dados[nome], null, 2) + '\n';
    });
    const assinatura = Object.keys(textos).map(function (n) { return textos[n]; }).join('\u0000');
    if (!sufixo && !forcar && estado.ultimo && estado.assinatura === assinatura) return estado.ultimo.nome; // nada mudou
    const raiz = await pastaDeBackups(true);
    const agora = new Date();
    let nome = nomeDaCopia(agora, sufixo);
    // Cópias automáticas do mesmo minuto compartilham a pasta (vale a mais recente). Cópias com
    // sufixo, como a de "antes de restaurar", nunca reaproveitam uma pasta: duas restaurações
    // seguidas não podem sobrescrever a cópia de segurança da primeira.
    if (sufixo) {
      let n = 2;
      while (await existePasta(raiz, nome)) nome = nomeDaCopia(agora, sufixo + '-' + n++);
    }
    const pasta = await raiz.getDirectoryHandle(nome, { create: true });
    for (const arquivo of Object.keys(textos)) {
      const handle = await pasta.getFileHandle(arquivo + '.json', { create: true });
      await App.storage.escreverTexto(handle, textos[arquivo]);
    }
    estado.ultimo = { nome: nome, quando: Date.now() };
    estado.assinatura = assinatura;
    if (!sufixo) estado.ultimaDoEstado = estado.ultimo.quando;
    return nome;
  }

  // Cópias existentes, da mais recente para a mais antiga.
  async function listar() {
    let raiz;
    try {
      raiz = await pastaDeBackups(false);
    } catch (erro) {
      return []; // ainda não existe a pasta backups
    }
    const itens = [];
    for await (const [nome, handle] of raiz.entries()) {
      if (handle.kind !== 'directory') continue;
      const i = interpretarNome(nome);
      if (i) itens.push(i);
    }
    return itens.sort(function (a, b) { return b.nome.localeCompare(a.nome); });
  }

  async function aplicarRetencao() {
    const raiz = await pastaDeBackups(false);
    const nomes = (await listar()).map(function (i) { return i.nome; });
    const apagar = selecionarParaApagar(nomes, U.hojeISO(), copiasMantidas(), DIAS_DE_HISTORICO);
    for (const nome of apagar) await raiz.removeEntry(nome, { recursive: true });
    return apagar;
  }

  // Lê uma cópia da pasta backups/ e confere o conteúdo.
  async function lerCopia(nome) {
    let pasta;
    try {
      pasta = await (await pastaDeBackups(false)).getDirectoryHandle(nome);
    } catch (erro) {
      throw new Erro('A cópia "' + nome + '" não foi encontrada na pasta backups.');
    }
    const conjunto = {};
    for (const arquivo of App.storage.ARQUIVOS) {
      let handle;
      try {
        handle = await pasta.getFileHandle(arquivo + '.json');
      } catch (erro) {
        throw new Erro('A cópia "' + nome + '" está incompleta: falta ' + arquivo + '.json.');
      }
      try {
        conjunto[arquivo] = JSON.parse(await (await handle.getFile()).text());
      } catch (erro) {
        throw new Erro('O arquivo ' + arquivo + '.json da cópia "' + nome + '" está danificado e não pode ser lido.');
      }
    }
    return validarConjunto(conjunto);
  }

  /* ---------- Automático ---------- */

  async function executarAutomatico() {
    if (estado.emAndamento) {
      estado.pendente = true;
      return;
    }
    estado.emAndamento = true;
    try {
      const pasta = App.storage.pasta();
      if (!pasta) return;
      if (pasta.queryPermission && (await pasta.queryPermission({ mode: 'readwrite' })) !== 'granted') return;
      await criarCopia();
      await aplicarRetencao();
      estado.falha = null;
      App.eventos.emit('backup:concluido', estado.ultimo);
    } catch (erro) {
      console.warn('Backup automático falhou:', erro);
      estado.falha = erro;
      App.eventos.emit('backup:falha', erro);
    } finally {
      estado.emAndamento = false;
      if (estado.pendente) {
        estado.pendente = false;
        agendar();
      }
    }
  }

  function agendar() {
    clearTimeout(estado.timer);
    estado.agendado = true;
    const atraso = atrasoDoProximoBackup(Date.now(), estado.ultimaDoEstado, intervaloMinutos() * 60 * 1000);
    estado.timer = setTimeout(function () {
      estado.agendado = false;
      executarAutomatico();
    }, atraso);
  }

  // Aba escondida ou fechada com alteração ainda sem cópia: copia agora, sem esperar o intervalo
  // (a não ser que a última cópia seja muito recente, para trocar de aba não gerar uma cópia a cada vez).
  function aoEsconderAAba() {
    if (!estado.agendado || document.visibilityState !== 'hidden') return;
    if (Date.now() - estado.ultimaDoEstado < INTERVALO_AO_ESCONDER_MS) return;
    clearTimeout(estado.timer);
    estado.agendado = false;
    executarAutomatico();
  }

  async function garantirCopiaDoDia() {
    const hoje = U.hojeISO();
    const copias = await listar();
    if (!copias.some(function (c) { return c.automatico && c.data === hoje; })) await executarAutomatico();
  }

  function iniciarAutomatico() {
    App.eventos.on('armazenamento:salvo', agendar);
    document.addEventListener('visibilitychange', aoEsconderAAba);
    App.eventos.on('armazenamento:carregado', function () {
      garantirCopiaDoDia().catch(function (erro) {
        console.warn('Não foi possível conferir os backups:', erro);
      });
    });
  }

  /* ---------- Arquivo único (backup manual) ---------- */

  function arquivoUnico() {
    const texto = JSON.stringify(
      { formato: FORMATO, versaoDoArquivo: VERSAO_DO_ARQUIVO, criadoEm: U.agoraISO(), aplicacao: App.versao, arquivos: conteudoAtual() },
      null,
      2
    ) + '\n';
    return { nome: 'MeuFinanceiro-backup-' + nomeDaCopia(new Date()) + '.json', texto: texto };
  }

  // Lê o texto de um arquivo único e devolve { conjunto, criadoEm, aplicacao }.
  function lerArquivoUnico(texto) {
    let obj;
    try {
      obj = JSON.parse(texto);
    } catch (erro) {
      throw new Erro('Este arquivo não é um backup do MeuFinanceiro (não foi possível ler o conteúdo).');
    }
    if (!obj || obj.formato !== FORMATO) throw new Erro('Este arquivo não é um backup do MeuFinanceiro.');
    if (!Number.isInteger(obj.versaoDoArquivo) || obj.versaoDoArquivo > VERSAO_DO_ARQUIVO) {
      throw new Erro('Este backup foi criado por uma versão mais nova do MeuFinanceiro. Atualize a aplicação antes de restaurá-lo.');
    }
    return { conjunto: validarConjunto(obj.arquivos), criadoEm: obj.criadoEm || null, aplicacao: obj.aplicacao || '' };
  }

  /* ---------- Restauração (RF-40) ---------- */

  // Confere o conjunto, guarda uma cópia de segurança do estado atual e troca os dados.
  // Devolve { copiaDeSeguranca, falhas }.
  async function restaurar(conjunto) {
    validarConjunto(conjunto);
    let copia;
    try {
      copia = await criarCopia(SUFIXO_RESTAURAR);
    } catch (erro) {
      throw new Erro('Não foi possível guardar uma cópia de segurança do estado atual (' + erro.message + '). A restauração foi cancelada e nada foi alterado.');
    }
    const resultado = await App.storage.substituirDados(conjunto);
    return { copiaDeSeguranca: copia, falhas: resultado.falhas };
  }

  App.backup = {
    SUFIXO_RESTAURAR: SUFIXO_RESTAURAR,
    nomeDaCopia: nomeDaCopia,
    interpretarNome: interpretarNome,
    selecionarParaApagar: selecionarParaApagar,
    copiasMantidas: copiasMantidas,
    intervaloMinutos: intervaloMinutos,
    atrasoDoProximoBackup: atrasoDoProximoBackup,
    validarConjunto: validarConjunto,
    resumo: resumo,
    criarCopia: criarCopia,
    listar: listar,
    aplicarRetencao: aplicarRetencao,
    lerCopia: lerCopia,
    iniciarAutomatico: iniciarAutomatico,
    executarAutomatico: executarAutomatico,
    arquivoUnico: arquivoUnico,
    lerArquivoUnico: lerArquivoUnico,
    restaurar: restaurar,
    ultimo: function () {
      return estado.ultimo;
    },
    falha: function () {
      return estado.falha;
    },
  };
})();
