'use client'

import { useState, useEffect } from 'react'
import Navigation from '@/components/Navigation'
import { Plus, Edit, Trash2, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('intro_message_templates')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTemplates(data || [])
    } catch (error) {
      console.error('Error loading templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = async (templateData) => {
    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('intro_message_templates')
          .update(templateData)
          .eq('id', editingTemplate.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('intro_message_templates')
          .insert(templateData)

        if (error) throw error
      }

      await loadTemplates()
      setShowCreateModal(false)
      setEditingTemplate(null)
    } catch (error) {
      console.error('Error saving template:', error)
      alert('Failed to save template: ' + error.message)
    }
  }

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Are you sure you want to delete this template?')) return

    try {
      const { error } = await supabase
        .from('intro_message_templates')
        .delete()
        .eq('id', id)

      if (error) throw error
      await loadTemplates()
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Failed to delete template: ' + error.message)
    }
  }

  const handleSetDefault = async (id) => {
    try {
      // Unset all defaults
      await supabase
        .from('intro_message_templates')
        .update({ is_default: false })
        .neq('id', '00000000-0000-0000-0000-000000000000')

      // Set new default
      await supabase
        .from('intro_message_templates')
        .update({ is_default: true })
        .eq('id', id)

      await loadTemplates()
    } catch (error) {
      console.error('Error setting default:', error)
      alert('Failed to set default: ' + error.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Message Templates</h1>
            <p className="text-gray-600 mt-2">Manage intro message templates for different groups</p>
          </div>
          
          <button
            onClick={() => {
              setEditingTemplate(null)
              setShowCreateModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            New Template
          </button>
        </div>

        {/* Templates List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500">No templates yet. Create your first one!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => (
              <div key={template.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">{template.name}</h3>
                      {template.is_default && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                          Default
                        </span>
                      )}
                      {!template.active && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                    
                    {template.filter_type && (
                      <p className="text-sm text-gray-600 mb-3">
                        Filter: {template.filter_type} 
                        {template.filter_value && ` = "${template.filter_value}"`}
                      </p>
                    )}
                    
                    <div className="bg-gray-50 rounded p-4 mb-4">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{template.message_text}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {!template.is_default && (
                      <button
                        onClick={() => handleSetDefault(template.id)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Set as default"
                      >
                        <Check className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditingTemplate(template)
                        setShowCreateModal(true)
                      }}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    {!template.is_default && (
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showCreateModal && (
          <TemplateModal
            template={editingTemplate}
            onSave={handleSaveTemplate}
            onClose={() => {
              setShowCreateModal(false)
              setEditingTemplate(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

function TemplateModal({ template, onSave, onClose }) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    message_text: template?.message_text || '',
    filter_type: template?.filter_type || 'all',
    filter_value: template?.filter_value || '',
    active: template?.active ?? true
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {template ? 'Edit Template' : 'Create New Template'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              placeholder="e.g., Committee Welcome Message"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message Text *
            </label>
            <textarea
              required
              value={formData.message_text}
              onChange={(e) => setFormData({ ...formData, message_text: e.target.value })}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              placeholder="Your intro message here..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Remember to include opt-out instructions: "Reply STOP to opt out"
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter Type
              </label>
              <select
                value={formData.filter_type}
                onChange={(e) => setFormData({ ...formData, filter_type: e.target.value, filter_value: '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              >
                <option value="all">All Members</option>
                <option value="committee">Committee</option>
                <option value="county">County</option>
                <option value="congressional_district">Congressional District</option>
              </select>
            </div>

            {formData.filter_type !== 'all' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter Value
                </label>
                <input
                  type="text"
                  value={formData.filter_value}
                  onChange={(e) => setFormData({ ...formData, filter_value: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  placeholder={`Enter ${formData.filter_type} name`}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="active" className="text-sm font-medium text-gray-700">
              Active (can be used for sending)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {template ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}