'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, BookOpen, Zap, StickyNote,
  Award, Settings, Sprout, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard',      icon: LayoutDashboard, label: 'Dashboard'   },
  { href: '/study',          icon: BookOpen,         label: 'Modo Estudo' },
  { href: '/exam',           icon: Zap,              label: 'Simulado'    },
  { href: '/notes',          icon: StickyNote,       label: 'Anotações'   },
  { href: '/certifications', icon: Award,            label: 'Provas'      },
]

export function Sidebar() {
  const path = usePathname()

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-bg-raised shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet">
          <Sprout className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-white">CertFarm</span>
        <span className="ml-auto text-2xs font-mono text-zinc-600">v0.1</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path === href || (href !== '/' && path.startsWith(href))
          return (
            <Link key={href} href={href} className={cn('nav-item', active && 'active')}>
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {active && <div className="ml-auto h-1 w-1 rounded-full bg-violet" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-2 py-2 space-y-0.5">
        <Link href="/settings" className={cn('nav-item', path === '/settings' && 'active')}>
          <Settings className="h-4 w-4" />
          Configurações
        </Link>
        <Link
          href="/admin"
          className={cn(
            'nav-item text-zinc-700 hover:text-zinc-500',
            path.startsWith('/admin') && 'active',
          )}
        >
          <ShieldCheck className="h-4 w-4" />
          Admin
        </Link>
      </div>
    </aside>
  )
}
