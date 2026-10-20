export type CustomerInput = { name: string; email: string; phone: string; cpf: string; neighborhood: string; password: string };
export class InputError extends Error {
  fields: Partial<Record<keyof CustomerInput, string>>;
  constructor(fields: Partial<Record<keyof CustomerInput, string>>) {
    super('Revise os campos informados.');
    this.fields = fields;
  }
}
export function validCpf(digits: string) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  for (const length of [9, 10]) {
    const sum = [...digits.slice(0, length)].reduce((total, digit, i) => total + Number(digit) * (length + 1 - i), 0);
    const check = (sum * 10) % 11;
    if (Number(digits[length]) !== (check === 10 ? 0 : check)) return false;
  }
  return true;
}
export function validateCustomer(input: unknown): CustomerInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError({ name: 'Envie um formulário válido.' });
  const source = input as Record<string, unknown>;
  const keys = ['name', 'email', 'phone', 'cpf', 'neighborhood', 'password'] as const;
  if (Object.keys(source).some(key => !keys.includes(key as keyof CustomerInput))) throw new InputError({ name: 'O formulário contém campos não permitidos.' });
  const data = {} as CustomerInput;
  const errors: Partial<Record<keyof CustomerInput, string>> = {};
  for (const key of keys) {
    const value = source[key];
    data[key] = typeof value === 'string' ? (key === 'password' ? value : value.trim()) : '';
    if (!data[key].trim()) errors[key] = 'Preencha este campo.';
  }
  if (data.name.length > 150) errors.name = 'Use até 150 caracteres.';
  data.email = data.email.toLowerCase();
  if (data.email && (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) errors.email = 'Informe um e-mail válido.';
  if (data.phone && (!/^[\d\s().-]+$/.test(data.phone) || data.phone.length > 30 || !/^\d{10,11}$/.test(data.phone.replace(/\D/g, '')))) errors.phone = 'Informe telefone com DDD, com 10 ou 11 dígitos.';
  if (data.cpf && (!/^[\d.\s-]+$/.test(data.cpf) || data.cpf.length > 20 || !validCpf(data.cpf.replace(/\D/g, '')))) errors.cpf = 'Confira os números do CPF.';
  if (data.neighborhood.length > 100) errors.neighborhood = 'Use até 100 caracteres.';
  // Long passphrases are accepted without mandatory symbol/uppercase rules.
  if ([...data.password].length < 8 || [...data.password].length > 128) errors.password = 'Use uma senha de 8 a 128 caracteres.';
  if (Object.keys(errors).length) throw new InputError(errors);
  data.phone = data.phone.replace(/\D/g, '');
  data.cpf = data.cpf.replace(/\D/g, '');
  return data;
}
