'use client'

import { formatDistanceToNow } from 'date-fns'
import { User } from 'lucide-react'

export default function ConversationList({ conversations, selectedId, onSelect }) {
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-gray-500 text-sm text-center">
          No conversations yet. Start messaging members!
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conv) => {
        const isSelected = conv.id === selectedId
        const memberName = conv.member?.name || 'Unknown'
        const timeAgo = conv.last_message_at
          ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })
          : ''

        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv)}
            className={`w-full p-4 border-b border-gray-200 hover:bg-gray-50 transition text-left ${
              isSelected ? 'bg-blue-50' : ''
            }`}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {memberName}
                  </p>
                  {timeAgo && (
                    <p className="text-xs text-gray-500">{timeAgo}</p>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">
                  {conv.member?.phone || 'No phone'}
                </p>
                {conv.status && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${
                    conv.status === 'active' ? 'bg-green-100 text-green-800' :
                    conv.status === 'waiting' ? 'bg-yellow-100 text-yellow-800' :
                    conv.status === 'resolved' ? 'bg-gray-100 text-gray-800' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {conv.status}
                  </span>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}