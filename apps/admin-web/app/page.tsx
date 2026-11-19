import { HouseIcon } from '@delyva/icons/web';
import { Button } from '@delyva/ui-web';
import type { ReactNode } from 'react';

/** Landing page scaffold built only from design-system components and token classes. */
export default function HomePage(): ReactNode {
  // DEBT(i18n): hard-coded English copy — i18n setup lands with the first real screen — move to message catalogues.
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-6 p-8">
      <header className="flex items-center gap-3">
        <span className="text-accent-text">
          <HouseIcon size={32} accessibilityLabel="Delyva Admin home" />
        </span>
        <h1 className="font-heading text-h1 font-extrabold">Operations console</h1>
      </header>
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-body text-text-muted">
          Nothing here yet. New work appears as soon as it arrives.
        </p>
      </section>
      <div>
        <Button variant="brand" size="lg">
          Get started
        </Button>
      </div>
    </main>
  );
}
