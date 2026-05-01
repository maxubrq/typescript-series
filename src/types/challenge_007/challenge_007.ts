/* eslint-disable */
/*
  43 - Exclude
  -------
  by Zheeeng (@zheeeng) #easy #built-in #union

  ### Question

  Implement the built-in `Exclude<T, U>`

  > Exclude from `T` those types that are assignable to `U`

  For example:

  ```ts
  type Result = MyExclude<'a' | 'b' | 'c', 'a'> // 'b' | 'c'
  ```

  > View on GitHub: https://tsch.js.org/43
*/

/* _____________ Your Code Here _____________ */

type MyExclude<T, U> = T extends U ? never : T;

// Do tính phân phối union, cả hai T và U đều là union
// Sẽ phân phôi, ví dụ (a | b) extends (a)
// Sẽ so sánh a extends a => never
// Sẽ so sánh b extends a => b
// Kiểu ra sẽ là never | b => bỏ never còn b

/* _____________ Test Cases _____________ */
import type { Equal, Expect } from '@type-challenges/utils';

export type cases = [
  Expect<Equal<MyExclude<'a' | 'b' | 'c', 'a'>, 'b' | 'c'>>,
  Expect<Equal<MyExclude<'a' | 'b' | 'c', 'a' | 'b'>, 'c'>>,
  Expect<Equal<MyExclude<string | number | (() => void), Function>, string | number>>,
];

/* _____________ Further Steps _____________ */
/*
  > Share your solutions: https://tsch.js.org/43/answer
  > View solutions: https://tsch.js.org/43/solutions
  > More Challenges: https://tsch.js.org
*/
