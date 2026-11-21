import { redirect } from 'next/navigation';

/** `/` → the orders board (the shell sends non-vendors to onboarding). */
export default function HomePage(): never {
  redirect('/orders');
}
