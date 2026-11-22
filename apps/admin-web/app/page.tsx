import { redirect } from 'next/navigation';

/** `/` → the overview (the console layout gates auth). */
export default function HomePage(): never {
  redirect('/overview');
}
