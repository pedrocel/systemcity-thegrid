// SystemCity — transcrição local com Whisper, dentro do navegador (transformers.js: WebGPU quando há, WASM quando não).
// A voz não sai da máquina: só o texto vai para o servidor. O modelo (~150 MB) baixa uma vez e fica no cache do navegador.
// Corta o áudio nas pausas: quando a pessoa fala e depois fica 0,8 s em silêncio (ou passa de 15 s falando), transcreve o trecho.
(() => {
'use strict';
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1', MODELO = 'onnx-community/whisper-base', TAXA = 16000;
let transcritor = null, carregando = null;

async function carregar(aoProgresso) {
  if (transcritor) return transcritor; if (carregando) return carregando;
  carregando = (async () => { const { pipeline } = await import(LIB);
    const device = navigator.gpu && (await navigator.gpu.requestAdapter().catch(() => null)) ? 'webgpu' : 'wasm';
    transcritor = await pipeline('automatic-speech-recognition', MODELO, { device, dtype: device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: (p) => { if (p.status === 'progress' && aoProgresso) aoProgresso(Math.round(p.progress)); } });
    return transcritor; })();
  try { return await carregando; } finally { carregando = null; }
}

// liga no microfone da chamada; aoTexto recebe cada frase pronta. Devolve uma função para parar.
async function iniciar(stream, aoTexto, { aoProgresso, mudo = () => false } = {}) {
  const asr = await carregar(aoProgresso), ctx = new AudioContext({ sampleRate: TAXA }), fonte = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1), pedacos = []; let falando = false, silencio = 0, total = 0, ocupado = false, fila = [];
  const transcrever = async (audio) => { fila.push(audio); if (ocupado) return; ocupado = true;
    while (fila.length) { const a = fila.shift();
      try { const r = await asr(a, { language: 'portuguese', task: 'transcribe' }), texto = String(r.text || '').trim();
        if (texto && !/^\[.*\]$|^\(.*\)$/.test(texto)) aoTexto(texto); } catch (e) { console.warn('whisper', e); } }
    ocupado = false; };
  const fechar = () => { if (!total) return; const a = new Float32Array(total); let o = 0; for (const p of pedacos.splice(0)) { a.set(p, o); o += p.length; }
    total = 0; falando = false; silencio = 0; if (a.length > TAXA * 0.5) transcrever(a); };
  proc.onaudioprocess = (ev) => {
    const d = ev.inputBuffer.getChannelData(0); if (mudo()) { pedacos.length = 0; total = 0; falando = false; return; }
    let soma = 0; for (let i = 0; i < d.length; i++) soma += d[i] * d[i]; const alto = Math.sqrt(soma / d.length) > 0.012;
    if (alto) { falando = true; silencio = 0; } else if (falando) silencio += d.length / TAXA;
    if (falando) { pedacos.push(new Float32Array(d)); total += d.length; }
    if (falando && (silencio > 0.8 || total > TAXA * 15)) fechar();
  };
  fonte.connect(proc); proc.connect(ctx.destination);
  return () => { fechar(); proc.disconnect(); fonte.disconnect(); ctx.close(); };
}

window.SystemCityWhisper = { iniciar, carregar, disponivel: () => typeof WebAssembly === 'object' };
})();
