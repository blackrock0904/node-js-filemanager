import { cwd } from 'node:process';

const exit = (n) => {
  console.log(`Thank you for using File Manager, ${n}, goodbye!`);
  process.exit(0);
};

const greeting = (n) => {
  console.log(`Welcome to the File Manager, ${n}!`);
}

const pwd = () => {
  console.log(`You are currently in ${cwd()}`);
};

const invalid = () => {
  console.log('Invalid input');
}

const failed = () => {
  console.log('Operation failed');
}

export {
  exit,
  greeting,
  pwd,
  invalid,
  failed,
}
