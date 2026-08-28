'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Plus,
  Layers,
  ChevronRight,
  Shield,
  Tag,
  CircleDot,
  Wrench,
  Sparkles,
} from 'lucide-react';
import { IMPLANT_CATALOG, type ImplantTemplate } from '@/lib/implantLibrary';
import { useEditorStore, type STLObject } from '@/stores/editorStore';
import { useToast } from '@/components/Toast';

interface ImplantLibraryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type CategoryTab = 'all' | 'plates' | 'screws' | 'cages' | 'guides';

export default function ImplantLibraryDrawer({ isOpen, onClose }: ImplantLibraryDrawerProps) {
  const { addObject, selectObject, setActiveTool } = useEditorStore();
  const { success } = useToast();

  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ImplantTemplate | null>(IMPLANT_CATALOG[0]);

  const filteredCatalog = useMemo(() => {
    return IMPLANT_CATALOG.filter((item) => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const matchQuery =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [selectedCategory, searchQuery]);

  const handleSpawnImplant = (template: ImplantTemplate) => {
    const geo = template.generateGeometry();
    const id = `implant_${template.id}_${Date.now().toString(36)}`;

    const newObj: STLObject = {
      id,
      name: `${template.name}`,
      geometry: geo,
      position: [0, 20, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: template.defaultColor,
      opacity: 1.0,
      visible: true,
    };

    addObject(newObj);
    selectObject(id);
    setActiveTool('translate');
    success('Implant Placed', `${template.name} added to 3D workspace`);
  };

  if (!isOpen) return null;

  return (
    <aside
      className="animate-fade-in"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 380,
        height: '100%',
        backgroundColor: '#ffffff',
        borderLeft: '1px solid var(--color-border-mist)',
        zIndex: 35,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border-mist)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: 'var(--color-keylime-wash)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-forest-ink)',
            }}
          >
            <Shield size={16} />
          </div>
          <div>
            <h4 style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-forest-ink)', margin: 0 }}>
              Implant Library
            </h4>
            <span style={{ fontSize: 11, color: 'var(--color-charcoal-muted)' }}>
              Surgical hardware & fixation templates
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="btn btn-ghost btn-icon"
          style={{ width: 28, height: 28, padding: 0 }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Search and Category Filter */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-mist)', gap: 8, display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--color-muted)' }} />
          <input
            type="text"
            placeholder="Search plates, screws, cages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            style={{ width: '100%', paddingLeft: 30, fontSize: 12, height: 34 }}
          />
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
          {([
            { id: 'all' as CategoryTab, label: 'All' },
            { id: 'plates' as CategoryTab, label: 'Plates' },
            { id: 'screws' as CategoryTab, label: 'Screws/Pins' },
            { id: 'cages' as CategoryTab, label: 'Spinal Cages' },
            { id: 'guides' as CategoryTab, label: 'Guides' },
          ] as const).map(({ id, label }) => {
            const isSelected = selectedCategory === id;
            return (
              <button
                key={id}
                onClick={() => setSelectedCategory(id)}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: isSelected ? 600 : 400,
                  borderRadius: 14,
                  border: isSelected ? '1px solid var(--color-forest-ink)' : '1px solid var(--color-border-mist)',
                  backgroundColor: isSelected ? 'var(--color-forest-ink)' : '#fff',
                  color: isSelected ? '#fff' : 'var(--color-charcoal)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 120ms ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Catalog List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {filteredCatalog.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--color-muted)', fontSize: 12 }}>
            No matching implants found
          </div>
        ) : (
          filteredCatalog.map((template) => {
            const isSelected = selectedTemplate?.id === template.id;
            return (
              <div
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  marginBottom: 8,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--color-keylime-wash)' : '#fafafa',
                  border: isSelected ? '1px solid var(--color-forest-ink)' : '1px solid var(--color-border-mist)',
                  transition: 'all 120ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: template.defaultColor,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-forest-ink)' }}>
                      {template.name}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: 4,
                      backgroundColor: 'rgba(0,0,0,0.05)',
                      color: 'var(--color-charcoal-muted)',
                      fontWeight: 600,
                    }}
                  >
                    {template.material.replace('_', ' ')}
                  </span>
                </div>

                <p style={{ fontSize: 11, color: 'var(--color-charcoal-muted)', margin: '6px 0 8px', lineHeight: 1.4 }}>
                  {template.description}
                </p>

                {/* Specs */}
                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                  <span>L: {template.dimensions.lengthMm}mm</span>
                  <span>W: {template.dimensions.widthMm}mm</span>
                  <span>T: {template.dimensions.thicknessMm}mm</span>
                  {template.dimensions.screwCount && (
                    <span>Holes: {template.dimensions.screwCount}</span>
                  )}
                </div>

                {isSelected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpawnImplant(template);
                    }}
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', marginTop: 10, fontSize: 12 }}
                  >
                    <Plus size={13} /> Spawn in 3D Scene
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--color-border-mist)',
          backgroundColor: '#fafafa',
          fontSize: 11,
          color: 'var(--color-charcoal-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Sparkles size={13} color="var(--color-forest-ink)" />
        <span>Use CSG Union or Subtraction to fuse or drill bone models.</span>
      </div>
    </aside>
  );
}
