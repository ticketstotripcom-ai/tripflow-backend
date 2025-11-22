import Dexie, { Table } from 'dexie';

export interface Lead {
  id?: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  assignedTo: string;
}

export class MySubClassedDexie extends Dexie {
  leads!: Table<Lead>; 
  calls!: Table<any>;

  constructor() {
    super('tripflow');
    this.version(2).stores({
      leads: '++id, name, email, phone, status, assignedTo',
      calls: '++id, number, event, incoming, timestamp'
    });
  }
}

export const db = new MySubClassedDexie();