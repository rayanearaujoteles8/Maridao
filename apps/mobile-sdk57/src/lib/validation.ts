export function validCpf(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  for (const length of [9, 10]) {
    const sum = [...digits.slice(0, length)].reduce((total, digit, i) => total + Number(digit) * (length + 1 - i), 0);
    const check = (sum * 10) % 11;
    if (Number(digits[length]) !== (check === 10 ? 0 : check)) return false;
  }
  return true;
}
export const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const validPhone = (value: string) => /^\d{10,11}$/.test(value.replace(/\D/g, ''));
export const validPassword = (value: string) => [...value].length >= 8 && [...value].length <= 128;
