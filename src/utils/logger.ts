/* eslint-disable no-console */

// Basic logger for consistent output
export const log = (...args: any[]) => {
  console.log(...args);
};

export const error = (...args: any[]) => {
  console.error(...args);
};

export const warn = (...args: any[]) => {
  console.warn(...args);
};