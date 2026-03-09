const ADMIN_EMAILS = [
  'AI-Team@guesty.com',
  'alvaro.cuba@guesty.com',
  'gil.almog@guesty.com',
];

export function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email);
}
