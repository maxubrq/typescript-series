// api-handler.legacy.ts
// Module xử lý response từ external API và ghi vào DB
// Viết vội năm 2019, "works on my machine"

import { Request, Response } from 'express';
import crypto from 'crypto';

export const Events = ['created', 'updated', 'deleted'] as const;
type EventTypes = (typeof Events)[number];

type ValidatedPayloads = Record<EventTypes, unknown>;

interface EventPayloads extends ValidatedPayloads {
  created: { id: string; createdAt: string };
  updated: { id: string; diff: string };
  deleted: { id: string; reason: string };
}

type EventMaps = {
  [k in keyof EventPayloads]: (input: { type: k; payload: EventPayloads[k] }) => void;
};

type CacheData = {
  [k in keyof EventPayloads]: EventPayloads[k];
};

class FetchError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

type BaseDbConfigs = {
  host: string;
  port: number;
  retries: number;
};

type UserId = string & { __brand: 'UserID' };

type UserDto = {
  id: string;
  meta: {
    age: string;
  };
  contact: {
    email: string;
  };
  profile: {
    name: string;
  };
  role: string;
  created: string;
};

type UserInfo = {
  id: string;
  name: string;
  email: string;
  age: number;
  role: string;
  createdAt: Date;
};

type UserCreatedDTO = {
  insertedId: string;
};

type QueryResult = {
  where: Record<string, string>;
  offset: number;
  limit: number;
  orderBy: string;
};

type QueryOptions = {
  page?: number;
  limit?: number;
  sort?: string;
};

type OK<D> = {
  success: true;
  data: D;
};

type Err<E> = {
  success: false;
  error: E;
};

type Result<D, E> = OK<D> | Err<E>;

type UserRequestBody = {
  userId?: string;
  options?: {
    limit?: number;
  };
};

// ❌ config object không có type
const DB_CONFIG: BaseDbConfigs = {
  host: 'localhost',
  port: 5432,
  retries: 3,
};

// ❌ Cache không typed
const _cache: CacheData = {
  created: {
    createdAt: '',
    id: '',
  },
  updated: {
    diff: '',
    id: '',
  },
  deleted: {
    id: '',
    reason: '',
  },
};

function isUserDto(val: unknown): val is UserDto {
  return (
    typeof val === 'object' &&
    val !== null &&
    'id' in val &&
    typeof val.id === 'string' &&
    'profile' in val &&
    typeof (val as any).profile?.name === 'string' &&
    'contact' in val &&
    typeof (val as any).contact?.email === 'string' &&
    'meta' in val &&
    typeof (val as any).meta?.age === 'string' &&
    'created' in val &&
    typeof (val as any).created === 'string'
  );
}

// ❌ Không biết shape của API response
async function fetchUserFromAPI(userId: UserId): Promise<Result<UserDto, FetchError>> {
  const url = `https://api.example.com/users/${userId as string}`;
  try {
    const res = await fetch(url);
    const statusCode = res.status;
    if (statusCode >= 200 && statusCode < 300) {
      const data = await res.json();
      if (isUserDto(data)) {
        return {
          success: true,
          data,
        };
      } else {
        return {
          success: false,
          error: new FetchError('ServerError', statusCode),
        };
      }
    } else if (statusCode >= 400 && statusCode <= 499) {
      return {
        success: false,
        error: new FetchError('ClientError', statusCode),
      };
    } else {
      return {
        success: false,
        error: new FetchError('ServerError', statusCode),
      };
    }
  } catch (err) {
    return {
      success: false,
      error: new FetchError(err instanceof Error ? err.message : 'UnknownError', 500),
    };
  }
}

// ❌ payload có thể là bất cứ thứ gì
function normalizeUser(payload: UserDto): UserInfo {
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
async function saveToDb(table: string, record: UserInfo): Promise<Result<UserCreatedDTO, Error>> {
  try {
    // giả lập DB call
    console.log(`Saving to ${table}`, record);
    return { success: true, data: { insertedId: crypto.randomBytes(12).toString() } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: new Error(message) };
  }
}

// ❌ options không có shape rõ ràng
function buildQuery(filters: Record<string, string>, options?: QueryOptions): QueryResult {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;
  const sort = options?.sort ?? 'asc';

  return {
    where: filters,
    offset: (page - 1) * limit,
    limit,
    orderBy: sort,
  };
}

// ❌ Express handler dùng any khắp nơi
export async function handleUserSync(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;

  if (typeof body !== 'object' || body === null) {
    res.status(400).json({ ok: false, message: 'Invalid body' });
    return;
  }

  const { userId, options } = body as UserRequestBody;

  if (!userId) {
    res.status(400).json({
      ok: false,
      message: 'Missing userId',
    });
    return;
  }

  try {
    const fetchResult = await fetchUserFromAPI(userId as UserId);

    if (!fetchResult.success) {
      const statusCode = fetchResult.error.statusCode;
      const message = fetchResult.error.message;
      res.status(statusCode).json({
        ok: false,
        message,
      });
      return;
    }

    const user = normalizeUser(fetchResult.data);

    // ❌ buildQuery nhận options không validated
    const query = buildQuery({ id: user.id }, options);
    console.log('Query:', query);

    const result = await saveToDb('users', user);

    if (!result.success) {
      res.status(500).json({
        ok: false,
        message: 'InternalServerError',
      });
      return;
    }

    // ❌ result.insertedId có thể undefined, không ai biết
    res.json({ ok: true, id: result.data.insertedId });
  } catch (err) {
    if (err instanceof Error) {
      // ❌ catch any — mất hết thông tin error
      console.error(err.message); // ❌ nếu err không phải Error thì crash
      res.status(500).json({ error: err.message });
    }
  }
}

// ❌ Util function nhận và return any
export function parseConfig(raw: Partial<BaseDbConfigs>): BaseDbConfigs {
  return {
    ...DB_CONFIG,
    ...raw,
  };
}

// ❌ Event emitter callback không typed
export function onDataEvent<E extends keyof EventMaps>(eventName: E, callback: EventMaps[E]): void {
  // giả lập event subscription
  console.log(`Subscribed to ${eventName}`);
  callback({ type: eventName, payload: _cache[eventName] });
}
