"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NavDropdown } from "./nav-dropdown";
import { visibleAddShortcuts } from "./add-shortcuts";

/** Top bar Add button — a dropdown of quick-create shortcuts to every
 * module with an add flow, instead of making the user navigate there and
 * find the Add button themselves. */
export function AddShortcutsMenu({ isGuest = false }: { isGuest?: boolean }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const shortcuts = visibleAddShortcuts(isGuest);

  function go(href: string) {
    setOpen(false);
    router.push(`${href}?new=1`);
  }

  return (
    <>
      <Button
        ref={buttonRef}
        size="sm"
        className="gap-1.5"
        aria-label="Add"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Plus className="size-4" />
        <span className="hidden sm:inline">Add</span>
      </Button>

      <NavDropdown open={open} onClose={() => setOpen(false)} anchorRef={buttonRef}>
        <div className="border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Quick add</span>
        </div>
        <ul className="py-1.5">
          {shortcuts.map((s) => (
            <li key={s.href}>
              <button
                onClick={() => go(s.href)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-brand">
                  <s.icon className="size-4" />
                </span>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </NavDropdown>
    </>
  );
}
