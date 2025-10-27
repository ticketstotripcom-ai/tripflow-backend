import { secureStorage } from '@/lib/secureStorage';

export type LocalRole = 'admin' | 'consultant';

export interface LocalUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: LocalRole;
  password: string;
}

const STORAGE_KEY = 'LOCAL_USERS_V1';

// Seed users based on provided names, emails, phones, roles, and default password
const DEFAULT_LOCAL_USERS: LocalUser[] = [
  {
    id: btoa('akash@local'),
    name: 'Akash Nayal',
    email: 'info@ticketstotrip.com',
    phone: '8979503010',
    role: 'admin',
    password: '123456',
  },
  {
    id: btoa('bimal@local'),
    name: 'Bimal Bhatt',
    email: 'bimal@ticketstotrip.com',
    phone: '7505217017',
    role: 'admin',
    password: '123456',
  },
  {
    id: btoa('esha@local'),
    name: 'Esha Pundir',
    email: 'outbound@ticketstotrip.com',
    phone: '8630969347',
    role: 'consultant',
    password: '123456',
  },
  {
    id: btoa('kajal@local'),
    name: 'Kajal Ramola',
    email: 'hello@ticketstotrip.com',
    phone: '6397089404',
    role: 'consultant',
    password: '123456',
  },
  {
    id: btoa('kushagra@local'),
    name: 'Kushagra Painuli',
    email: 'connect@ticketstotrip.com',
    phone: '8178798726',
    role: 'consultant',
    password: '123456',
  },
  {
    id: btoa('nitu@local'),
    name: 'Nitu Rajpoot',
    email: 'tripexpert@ticketstotrip.com',
    phone: '9368852651',
    role: 'consultant',
    password: '123456',
  },
  {
    id: btoa('pankaj@local'),
    name: 'Pankaj Pandey',
    email: 'ticketstotrip.com@gmail.com',
    phone: '9999274355',
    role: 'admin',
    password: '123456',
  },
  {
    id: btoa('himanshu@local'),
    name: 'Himanshu Dogra',
    email: 'bimalticketstotrip.com@gmail.com',
    phone: '9211318050',
    role: 'consultant',
    password: '123456',
  },
  {
    id: btoa('naveen@local'),
    name: 'Naveen Rawat',
    email: 'corporate@ticketstotrip.com',
    phone: '9258311277',
    role: 'consultant',
    password: '123456',
  },
  {
    id: btoa('trisha@local'),
    name: 'Trisha',
    email: 'trisha@ticketstotrip.com',
    phone: '9999274355',
    role: 'consultant',
    password: '123456',
  },
];

export async function getLocalUsers(): Promise<LocalUser[]> {
  try {
    const stored = await secureStorage.get(STORAGE_KEY);
    if (!stored) return DEFAULT_LOCAL_USERS;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return DEFAULT_LOCAL_USERS;
    return parsed;
  } catch {
    return DEFAULT_LOCAL_USERS;
  }
}

export async function saveLocalUsers(users: LocalUser[]): Promise<void> {
  await secureStorage.set(STORAGE_KEY, JSON.stringify(users));
}

export async function addLocalUser(user: Omit<LocalUser, 'id'>): Promise<LocalUser> {
  const users = await getLocalUsers();
  const idBase = user.email || user.phone || `${user.name}-${Date.now()}`;
  const newUser: LocalUser = { ...user, id: btoa(idBase.toLowerCase()) };
  const next = [...users, newUser];
  await saveLocalUsers(next);
  return newUser;
}

export async function deleteLocalUser(id: string): Promise<void> {
  const users = await getLocalUsers();
  const next = users.filter(u => u.id !== id);
  await saveLocalUsers(next);
}

export async function updateLocalUserRole(id: string, role: LocalRole): Promise<void> {
  const users = await getLocalUsers();
  const next = users.map(u => (u.id === id ? { ...u, role } : u));
  await saveLocalUsers(next);
}

export async function updateLocalUser(updated: Partial<LocalUser> & { id: string }): Promise<void> {
  const users = await getLocalUsers();
  const next = users.map(u => (u.id === updated.id ? { ...u, ...updated } : u));
  await saveLocalUsers(next);
}

export async function findLocalUserByIdentifier(identifier: string, password: string): Promise<LocalUser | null> {
  const users = await getLocalUsers();
  const ident = String(identifier || '').trim().toLowerCase();
  const user = users.find(u => (
    u.email?.toLowerCase() === ident || u.phone === ident
  ) && u.password === password);
  return user || null;
}
