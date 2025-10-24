'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare, Users, BarChart3, MessageCircle } from 'lucide-react'

export default function Navigation() {
  const pathname = usePathname()
  
  const links = [
    { href: '/', label: 'Dashboard', icon: BarChart3 },
    { href: '/members', label: 'Members', icon: Users },
    { href: '/messenger', label: 'Messenger', icon: MessageSquare },
    { href: '/conversations', label: 'Conversations', icon: MessageCircle },
  ]
  
  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              {/* FIXED: Changed from "MOYD CRM" to "Missouri Young Democrats" */}
              <h1 className="text-xl font-bold text-blue-600">Missouri Young Democrats</h1>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {links.map((link) => {
                const Icon = link.icon
                const isActive = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                      isActive
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {link.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}