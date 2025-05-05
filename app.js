import { homedir } from 'node:os';
import { chdir } from 'node:process';
import readline from 'node:readline';
import { dirname, resolve, join, basename } from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import * as fsPromises from 'node:fs/promises';
import * as shore from './shore.js';
import { createHash } from 'node:crypto';
import { createBrotliCompress } from 'node:zlib';

const app = () => {
  const args = process.argv.slice(2);
  const username = args.find(arg => arg.startsWith('--username='))?.split('=')[1] || 'Unknown';
  let currentDir = homedir();

  chdir(currentDir);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  rl.on('line', async (line) => {
    const [command, ...args] = line.trim().split(' ');

    switch (command) {
      case '.exit':
        shore.exit(username);
        break;

      case 'up':
        const upper = dirname(currentDir);
        if (upper !== currentDir) {
          currentDir = upper;
          chdir(currentDir);
        }
        break;

      case 'cd':
        if (!args[0]) {
          shore.invalid();
          break;
        }

        const newDir = resolve(currentDir, args[0]);
        if (fs.existsSync(newDir) && fs.lstatSync(newDir).isDirectory()) {
          currentDir = newDir;
          chdir(currentDir);
        } else {
          shore.failed();
        }
        break;

      case 'ls':
        try {
          const items = fs.readdirSync(currentDir, { withFileTypes: true });
          const folders = items
            .filter(i => i.isDirectory())
            .map(i => ({ Name: i.name, Type: 'directory' }))
            .sort((a, b) => b.Name.localeCompare(a.name));
          const files = items
            .filter(i => i.isFile())
            .map(i => ({ Name: i.name, Type: 'file' }))
            .sort((a, b) => b.Name.localeCompare(a.name));
          const data = [...folders, ...files];
          console.table(data);
        } catch {
          shore.failed();
        }
        break;

      case 'cat': {
        if (!args[0]) {
          shore.invalid();

          break;
        }

        const filePath = resolve(currentDir, args[0]);
        const stream = fs.createReadStream(filePath, 'utf-8');
        stream.on('error', shore.failed);
        stream.pipe(process.stdout);
        stream.on('end', () => {
          shore.pwd();
          rl.prompt();
        });

        return;
      }

      case 'add': {
        if (!args[0]) {
          shore.invalid();

          break;
        }
        const filePath = resolve(currentDir, args[0]);
        try {
          await fsPromises.writeFile(filePath, '', { flag: 'wx' });
        } catch {
          shore.failed();
        }
        break;
      }

      case 'mkdir':
        if (!args[0]) {
          shore.invalid();

          break;
        }

        const dir = resolve(currentDir, args[0]);
        try {
          await  fsPromises.mkdir(dir);
        } catch {
          shore.failed();
        }
        break;

      case 'rn': {
        const [pathToFile, newName] = args;
        if (!pathToFile || !newName) {
          shore.invalid();

          break;
        }

        const oldPath = resolve(currentDir, pathToFile);
        const newPath = join(dirname(oldPath), newName);
        try {
          await fsPromises.rename(oldPath, newPath);
        } catch {
          shore.failed();
        }
        break;
      }

      case 'cp': {
        const [src, destDir] = args;
        if (!src || !destDir) {
          shore.invalid();

          break;
        }

        const srcPath = resolve(currentDir, src);
        const destPath = join(resolve(currentDir, destDir), basename(src));
        try {
          const readStream = fs.createReadStream(srcPath);
          const writeStream = fs.createWriteStream(destPath);
          readStream.pipe(writeStream);
          await new Promise((res, rej) => {
            writeStream.on('finish', res);
            writeStream.on('error', rej);
            readStream.on('error', rej);
          });
        } catch {
          shore.failed();
        }
        break;
      }

      case 'mv': {
        const [src, destDir] = args;
        if (!src || !destDir) {
          shore.invalid();

          break;
        }

        const srcPath = resolve(currentDir, src);
        const destPath = join(resolve(currentDir, destDir), basename(src));
        try {
          const readStream = fs.createReadStream(srcPath);
          const writeStream = fs.createWriteStream(destPath);
          readStream.pipe(writeStream);
          await new Promise((res, rej) => {
            writeStream.on('finish', res);
            writeStream.on('error', rej);
            readStream.on('error', rej);
          });
          await fsPromises.unlink(srcPath);
        } catch {
          shore.failed();
        }
        break;
      }

      case 'rm': {
        if (!args[0]) {
          shore.invalid();
          rl.prompt();

          return;
        }
        const filePath = resolve(currentDir, args[0]);
        try {
          await fsPromises.unlink(filePath);
        } catch {
          shore.failed();
        }
        break;
      }

      case 'os':
        switch (args[0]) {
          case '--EOL':
            console.log(JSON.stringify(os.EOL));
            break;
          case '--cpus':
            const cpus = os.cpus();
            console.log(`Overall CPUs: ${cpus.length}`);
            cpus.forEach((cpu, index) => {
              console.log(`CPU ${index + 1}: ${cpu.model}, ${cpu.speed / 1000} GHz`);
            });
            break;
          case '--homedir':
            console.log(os.homedir());
            break;
          case '--username':
            console.log(os.userInfo().username);
            break;
          case '--architecture':
            console.log(os.arch());
            break;

          default:
            shore.invalid();
        }
        break;

      case 'hash':
        if (!args[0]) {
          shore.invalid();
          rl.prompt();

          return;
        }

        const fileToHash = resolve(currentDir, args[0]);

        if (!fs.existsSync(fileToHash) || !fs.lstatSync(fileToHash).isFile()) {
          shore.failed();
          break;
        }

        try {
          const hash = createHash('sha256');
          const stream = fs.createReadStream(fileToHash);

          stream.on('error', () => {
            shore.failed();
            rl.prompt();
          });

          stream.on('data', chunk => hash.update(chunk));
          stream.on('end', () => {
            console.log('SHA256:', hash.digest('hex'));
            shore.pwd();
            rl.prompt();
          });

          return;
        } catch {
          shore.failed();
        }
        break;

      case 'compress':
        if (args.length < 2) {
          shore.invalid();

          break;
        }

        const source = resolve(currentDir, args[0]);
        const destination = resolve(currentDir, args[1]);

        if (!fs.existsSync(source) || !fs.lstatSync(source).isFile()) {
          shore.failed();
          break;
        }

        const readStream = fs.createReadStream(source);
        const writeStream = fs.createWriteStream(destination);
        const brotli = createBrotliCompress();

        readStream
          .pipe(brotli)
          .pipe(writeStream)
          .on('finish', () => {
            console.log('File compressed.');
            shore.pwd();
            rl.prompt();
          })
          .on('error', () => shore.failed());

        return;

      default:
        shore.invalid();
    }

    shore.pwd();
    rl.prompt();
  });

  rl.on('SIGINT', () => shore.exit(username));

  shore.greeting(username);
  shore.pwd();
  rl.prompt();
}

app();
