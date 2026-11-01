#!/usr/bin/env node
// Gera um certificado autoassinado para servir a cidade em HTTPS na rede local. Sem HTTPS, o navegador de quem acessa por
// outro computador (http://10.0.0.5:4400) não libera câmera, microfone nem transcrição.
// Uso: node certificado.mjs        → dados/cert/cert.pem e dados/cert/chave.pem, válidos para localhost e os IPs desta máquina.
// Quem abrir o endereço vê um aviso de certificado na primeira vez: é só avançar ("Avançado" → "Continuar").
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces, hostname, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = join(dirname(fileURLToPath(import.meta.url)), 'dados', 'cert'); mkdirSync(pasta, { recursive: true });
const ips = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4').map(i => i.address);
const nomes = ['localhost', `${hostname()}`, `${hostname().replace(/\.local$/, '')}.local`];
const san = [...new Set(nomes)].map(n => `DNS:${n}`).concat(ips.map(ip => `IP:${ip}`)).join(',');
const conf = join(tmpdir(), `systemcity-cert-${process.pid}.cnf`);
writeFileSync(conf, `[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=SystemCity local\n[ext]\nsubjectAltName=${san}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825', '-keyout', join(pasta, 'chave.pem'), '-out', join(pasta, 'cert.pem'), '-config', conf], { stdio: 'ignore' });
console.log(`Certificado em ${pasta}\nVale para: ${san.replace(/(DNS|IP):/g, '').split(',').join(', ')}`);
