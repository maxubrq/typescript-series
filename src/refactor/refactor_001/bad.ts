// api-handler.legacy.ts
// Module xử lý response từ external API và ghi vào DB
// Viết vội năm 2019, "works on my machine"

import { Request, Response } from 'express';

// ❌ config object không có type
const DB_CONFIG: any = {
  host: 'localhost',
  port: 5432,
  retries: 3,
};

// ❌ Cache không typed
const _cache: any = {};

// ❌ Không biết shape của API response
async function fetchUserFromAPI(userId: any): Promise<any> {
  const res = await fetch(`https://api.example.com/users/${userId}`);
  const data = await res.json(); // ❌ trả về any
  return data;
}

// ❌ payload có thể là bất cứ thứ gì
function normalizeUser(payload: any): any {
  return {
    id: payload.id,
    name: payload.profile.name, // ❌ runtime crash nếu profile undefined
    email: payload.contact.email, // ❌ same
    age: parseInt(payload.meta.age), // ❌ NaN nếu meta không tồn tại
    role: payload.role || 'user',
    createdAt: new Date(payload.created), // ❌ Invalid Date nếu created sai format
  };
}

// ❌ saveToDb nhận anything, return anything
async function saveToDb(table: string, record: any): Promise<any> {
  // giả lập DB call
  console.log(`Saving to ${table}`, record);
  return { success: true, insertedId: Math.random() };
}

// ❌ options không có shape rõ ràng
function buildQuery(filters: any, options?: any): any {
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const sort = options?.sort || 'asc';

  return {
    where: filters,
    offset: (page - 1) * limit,
    limit,
    orderBy: sort,
  };
}

// ❌ Express handler dùng any khắp nơi
export async function handleUserSync(req: Request, res: Response): Promise<void> {
  const { userId, options } = req.body; // ❌ body là any

  try {
    const raw = await fetchUserFromAPI(userId);

    // ❌ check kiểu này không đủ, raw vẫn là any
    if (!raw) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    const user = normalizeUser(raw);

    // ❌ buildQuery nhận options không validated
    const query = buildQuery({ id: user.id }, options);
    console.log('Query:', query);

    const result = await saveToDb('users', user);

    // ❌ result.insertedId có thể undefined, không ai biết
    res.json({ ok: true, id: result.insertedId });
  } catch (err: any) {
    // ❌ catch any — mất hết thông tin error
    console.error(err.message); // ❌ nếu err không phải Error thì crash
    res.status(500).json({ error: err.message });
  }
}

// ❌ Util function nhận và return any
export function parseConfig(raw: any): any {
  return {
    ...DB_CONFIG,
    ...raw,
    port: Number(raw.port), // ❌ NaN nếu raw.port không tồn tại
  };
}

// ❌ Event emitter callback không typed
export function onDataEvent(eventName: any, callback: any): void {
  // giả lập event subscription
  console.log(`Subscribed to ${eventName}`);
  callback({ type: eventName, payload: _cache[eventName] });
}
