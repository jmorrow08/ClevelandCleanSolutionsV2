import { useState } from "react";
import { NavLink } from "react-router-dom";

type NavItem = { label: string; to: string };

interface MobileMenuProps {
  title: string;
  items: NavItem[];
}

export function MobileMenu({ title, items }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:hidden relative">
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-md hover:bg-[var(--muted)] transition-colors"
        aria-label="Toggle menu"
      >
        <svg
          className="w-6 h-6 text-[var(--text)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Mobile Menu Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu Panel */}
          <div className="absolute top-full left-0 right-0 bg-[var(--bg)] border border-[var(--border)] rounded-md shadow-lg z-50 max-h-96 overflow-y-auto">
            {/* Menu Header */}
            <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--muted)]">
              <h3 className="font-semibold text-[var(--text)]">{title}</h3>
            </div>

            {/* Menu Items */}
            <nav className="py-2">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsOpen(false)}
                  className={({ isActive }) =>
                    `block px-4 py-3 text-sm border-b border-[var(--border)] last:border-b-0 ${
                      isActive
                        ? "bg-[var(--brand)] text-white"
                        : "text-[var(--text)] hover:bg-[var(--muted)]"
                    }`
                  }
                  end={item.to === "/"}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}

