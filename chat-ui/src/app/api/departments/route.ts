import { getDepartmentList } from '@/lib/departments';

export async function GET(): Promise<Response> {
  return Response.json(getDepartmentList());
}
