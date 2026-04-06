
import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/lib/api';
import { Announcement, AnnouncementPayload } from '@/types';
import Sidebar from '@/components/layout/Sidebar';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Loader2, AlertCircle, RefreshCw,
  Bell, BellOff, GripVertical, ToggleLeft, ToggleRight, Link2, ExternalLink,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Type, Palette, ImagePlus, X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TipTapUnderline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { supabase } from '@/lib/supabase';

// ─── Rich Text Editor ─────────────────────────────────────────────────────────

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px'];
const TEXT_COLORS = [
  '#000000', '#1a1a2e', '#374151', '#6b7280',
  '#dc2626', '#ea580c', '#d97706', '#16a34a',
  '#0284c7', '#7c3aed', '#db2777', '#0f766e',
  '#ffffff', '#f8fafc', '#fef3c7', '#dbeafe',
];

// Custom FontSize extension using TextStyle
import { Extension } from '@tiptap/core';
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (attrs) => {
            if (!attrs.fontSize) return {};
            return { style: `font-size: ${attrs.fontSize}` };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }: { chain: () => unknown }) => {
        // The original code uses a cast to 'any' which is problematic if the rule is not defined.
        // A safer, type-aware approach is to ensure the chain has the expected method.
        // For simplicity and minimal change as requested, we'll keep the cast if it's due to linting config,
        // but if the runtime type of 'chain' is truly an issue, it might need a more robust type assertion or check.
        // Given the error message "Definition for rule '@typescript-eslint/no-explicit-any' was not found.",
        // it implies an ESLint configuration issue rather than a TypeScript type error.
        // If the `eslint-disable-next-line` comment is causing an ESLint config error, the simplest fix is to remove it,
        // as the actual TypeScript syntax is valid. If the underlying issue is that the `setFontSize` method
        // is not properly typed in `ReturnType<typeof chain>`, then `any` is a workaround.
        // Removing the `eslint-disable-next-line` is the most direct fix for the *reported error message*.
        return (chain() as ReturnType<typeof chain> & { setMark: (m: string, a: Record<string, unknown>) => unknown }).setMark('textStyle', { fontSize });
      },
      unsetFontSize: () => ({ chain }: { chain: () => unknown }) => {
        return (chain() as ReturnType<typeof chain> & { setMark: (m: string, a: Record<string, unknown>) => unknown }).setMark('textStyle', { fontSize: null });
      },
    };
  },
});

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

const RichTextEditor = ({ content, onChange }: RichTextEditorProps) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TipTapUnderline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      FontSize,
    ],
    content: content || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'min-h-[160px] px-4 py-3 text-sm leading-relaxed focus:outline-none',
      },
    },
  });

  if (!editor) return null;

  const ToolBtn = ({
    onClick, active, title, children,
  }: {
    onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors text-sm ${
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );

  const Divider = () => <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;

  return (
    <div className="rounded-lg border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-input bg-muted/30">
        {/* Text style */}
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <Underline size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <span className="text-xs font-bold line-through">S</span>
        </ToolBtn>

        <Divider />

        {/* Font size */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setShowSizePicker((v) => !v); setShowColorPicker(false); }}
            title="Font size"
            className="flex items-center gap-1 px-1.5 h-7 rounded text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Type size={12} />
            <span className="text-[11px] font-medium">Size</span>
          </button>
          {showSizePicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[90px]">
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    // The reported error "Definition for rule '@typescript-eslint/no-explicit-any' was not found."
                    // indicates an ESLint config issue, not a TypeScript syntax error.
                    // The line `// eslint-disable-next-line @typescript-eslint/no-explicit-any` is itself valid TSX.
                    // The most minimal fix is to remove this comment if the rule itself is missing or misconfigured in ESLint.
                    // However, if the rule *is* active and the error refers to the *definition* of the rule, it's an environment issue.
                    // Assuming the intent was to disable the rule for *that line*, if the rule itself is problematic,
                    // removing the comment and letting TypeScript infer or providing a proper type is better.
                    // For minimal change specific to the error message (rule *definition* not found), removing the comment is often the solution,
                    // as the comment syntax itself isn't what's causing the problem, but rather the ESLint configuration being unable
                    // to interpret the rule name.
                    // If the actual problem was the `any` type, then a more complex type assertion would be needed.
                    // For this specific error message, removing the comment is the most direct fix, assuming the type itself works fine.
                    (editor.chain().focus() as ReturnType<typeof editor.chain> & { setFontSize: (size: string) => unknown }).setFontSize(size).run();
                    setShowSizePicker(false);
                  }}
                  className="w-full text-left px-2 py-1 text-xs hover:bg-secondary rounded transition-colors"
                  style={{ fontSize: size }}
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Color picker */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setShowColorPicker((v) => !v); setShowSizePicker(false); }}
            title="Text colour"
            className="flex items-center gap-1 px-1.5 h-7 rounded text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Palette size={12} />
            <span className="text-[11px] font-medium">Colour</span>
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-2" style={{ minWidth: 160 }}>
              <div className="grid grid-cols-8 gap-1">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor.chain().focus().setColor(color).run();
                      setShowColorPicker(false);
                    }}
                    className="w-5 h-5 rounded border border-border/50 hover:scale-110 transition-transform"
                    style={{ background: color }}
                    title={color}
                  />
                ))}
              </div>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }}
                className="mt-1.5 w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset colour
              </button>
            </div>
          )}
        </div>

        <Divider />

        {/* Headings */}
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
          <span className="text-[11px] font-bold">H1</span>
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <span className="text-[11px] font-bold">H2</span>
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <span className="text-[11px] font-bold">H3</span>
        </ToolBtn>

        <Divider />

        {/* Alignment */}
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">
          <AlignLeft size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align centre">
          <AlignCenter size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">
          <AlignRight size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify">
          <AlignJustify size={13} />
        </ToolBtn>

        <Divider />

        {/* Lists */}
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          <List size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
          <ListOrdered size={13} />
        </ToolBtn>

        <Divider />

        {/* Clear */}
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().clearNodes().unsetAllMarks().run(); }}
          title="Clear formatting"
          className="px-1.5 h-7 flex items-center rounded text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} className="prose prose-sm max-w-none" />
    </div>
  );
};

// ─── Announcement Modal ───────────────────────────────────────────────────────

interface AnnouncementModalProps {
  item: Announcement | null;
  open: boolean;
  onClose: () => void;
  onSaved: (a: Announcement) => void;
}

const EMPTY_FORM = {
  title: '',
  body: '',
  link_url: '',
  image_url: '',
  is_active: true,
  display_order: 0,
};

const AnnouncementModal = ({ item, open, onClose, onSaved }: AnnouncementModalProps) => {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [lastItem, setLastItem] = useState(item);
  if (item !== lastItem) {
    setLastItem(item);
    setForm(
      item
        ? { title: item.title, body: item.body ?? '', link_url: item.link_url ?? '', image_url: item.image_url ?? '', is_active: item.is_active, display_order: item.display_order }
        : { ...EMPTY_FORM }
    );
  }

  const set = <K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleUpload = async (file: File) => {
    setUploadingImage(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `announcements/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('adhkar-images')
      .upload(path, file, { contentType: file.type, upsert: false });
    setUploadingImage(false);
    if (error || !data) { toast.error('Upload failed: ' + (error?.message ?? 'Unknown')); return; }
    const { data: urlData } = supabase.storage.from('adhkar-images').getPublicUrl(data.path);
    set('image_url', urlData.publicUrl);
    toast.success('Poster uploaded.');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.title?.trim()) { toast.error('Title is required.'); return; }
    setSaving(true);
    try {
      const payload: Partial<AnnouncementPayload> = {
        title: form.title.trim(),
        body: form.body?.trim() || null,
        link_url: form.link_url?.trim() || null,
        image_url: form.image_url?.trim() || null,
        is_active: form.is_active ?? true,
        display_order: Number(form.display_order) || 0,
      };
      const saved = item
        ? await updateAnnouncement(item.id, payload)
        : await createAnnouncement(payload);
      toast.success(item ? 'Announcement updated.' : 'Announcement created.');
      onSaved(saved);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save announcement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Bell size={15} className="text-primary" />
            {item ? 'Edit Announcement' : 'New Announcement'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Title <span className="text-destructive">*</span></Label>
            <Input
              value={form.title ?? ''}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Ramadan Timetable Now Available"
              className="h-9"
              autoFocus
            />
          </div>

          {/* Rich text body */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Description</Label>
            <RichTextEditor
              content={form.body ?? ''}
              onChange={(html) => set('body', html)}
            />
            <p className="text-[11px] text-muted-foreground">Full text with formatting — shown beneath the title in the app.</p>
          </div>

          {/* Poster image */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <ImagePlus size={13} className="text-muted-foreground" />
              Event Poster / Image
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </Label>

            {form.image_url ? (
              <div className="relative rounded-xl overflow-hidden border border-border bg-muted/30" style={{ maxHeight: 260 }}>
                <img
                  src={form.image_url}
                  alt="Poster preview"
                  className="w-full object-contain"
                  style={{ maxHeight: 260 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => set('image_url', '')}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 shadow"
                  title="Remove poster"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 py-8 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                onClick={() => imageInputRef.current?.click()}
              >
                {uploadingImage ? (
                  <><Loader2 size={20} className="animate-spin text-muted-foreground" /><p className="text-xs text-muted-foreground">Uploading…</p></>
                ) : (
                  <><ImagePlus size={24} className="text-muted-foreground/50" /><p className="text-xs text-muted-foreground">Click to upload a poster</p><p className="text-[11px] text-muted-foreground/60">JPG, PNG, WebP up to 10MB</p></>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={form.image_url ?? ''}
                onChange={(e) => set('image_url', e.target.value)}
                placeholder="Or paste a public image URL…"
                className="flex-1 text-sm h-9"
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-xs font-medium hover:bg-primary/5 transition-colors disabled:opacity-50 shrink-0"
              >
                {uploadingImage ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                {uploadingImage ? 'Uploading…' : 'Upload'}
              </button>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </div>

          {/* More Info Link */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Link2 size={13} className="text-muted-foreground" />
              More Info URL
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </Label>
            <Input
              value={form.link_url ?? ''}
              onChange={(e) => set('link_url', e.target.value)}
              placeholder="https://example.com/ramadan-timetable"
              type="url"
              className="h-9 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">A button linking to this URL will appear in the app.</p>
          </div>

          {/* Order + Status */}
          <div className="flex items-end gap-4">
            <div className="space-y-1.5 w-32">
              <Label className="text-sm font-medium">Display order</Label>
              <Input
                type="number"
                value={form.display_order ?? 0}
                onChange={(e) => set('display_order', parseInt(e.target.value) || 0)}
                className="h-9 font-mono text-sm"
                min={0}
              />
            </div>

            <div className="flex-1 space-y-1.5">
              <Label className="text-sm font-medium">Status</Label>
              <button
                type="button"
                onClick={() => set('is_active', !form.is_active)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all w-full ${
                  form.is_active
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {form.is_active ? (
                  <><ToggleRight size={16} className="text-emerald-500" /> Active — visible in app</>
                ) : (
                  <><ToggleLeft size={16} className="text-slate-400" /> Inactive — hidden from app</>
                )}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {saving ? <><Loader2 size={13} className="animate-spin mr-1" />Saving…</> : item ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Sortable Announcement Card ───────────────────────────────────────────────

interface AnnouncementCardProps {
  item: Announcement;
  onEdit: (a: Announcement) => void;
  onToggle: (a: Announcement) => void;
  onDelete: (a: Announcement) => void;
  isDragOverlay?: boolean;
}

const AnnouncementCard = ({ item, onEdit, onToggle, onDelete, isDragOverlay }: AnnouncementCardProps) => {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteAnnouncement(item.id);
      toast.success('Announcement deleted.');
      onDelete(item);
    } catch {
      toast.error('Failed to delete.');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      const updated = await updateAnnouncement(item.id, { is_active: !item.is_active });
      toast.success(updated.is_active ? 'Announcement activated.' : 'Announcement deactivated.');
      onToggle(updated);
    } catch {
      toast.error('Failed to update status.');
    } finally {
      setToggling(false);
    }
  };

  // Strip HTML tags for plain-text preview in collapsed card
  const plainBody = item.body ? item.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-xl border overflow-hidden transition-all bg-card ${
        isDragOverlay
          ? 'shadow-xl border-primary/40 rotate-1'
          : item.is_active
            ? 'border-border hover:border-primary/30 hover:shadow-sm'
            : 'border-dashed border-border/60 bg-muted/20 opacity-60'
      }`}
    >
      {/* Poster image */}
      {item.image_url && (
        <div className="w-full overflow-hidden" style={{ maxHeight: 180 }}>
          <img
            src={item.image_url}
            alt={item.title}
            className="w-full object-cover"
            style={{ maxHeight: 180 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      <div className="flex items-start gap-3 px-5 py-4">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 mt-1 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5 rounded"
          title="Drag to reorder"
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>

        {/* Icon */}
        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${item.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
          {item.is_active
            ? <Bell size={14} className="text-primary" />
            : <BellOff size={14} className="text-muted-foreground" />
          }
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm leading-snug" style={{ color: 'hsl(var(--foreground))' }}>
              {item.title}
            </h3>
            <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
              item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {item.is_active ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>
          {plainBody && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
              {plainBody}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {item.image_url && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ImagePlus size={10} /> Poster attached
              </span>
            )}
            {item.link_url && (
              <a
                href={item.link_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <ExternalLink size={10} /> More Info
              </a>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">
            Order: {item.display_order} · Updated {new Date(item.updated_at).toLocaleDateString()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleToggle}
            disabled={toggling}
            title={item.is_active ? 'Deactivate' : 'Activate'}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors disabled:opacity-40"
          >
            {toggling
              ? <Loader2 size={13} className="animate-spin text-muted-foreground" />
              : item.is_active
                ? <ToggleRight size={15} className="text-emerald-600" />
                : <ToggleLeft size={15} className="text-muted-foreground" />
            }
          </button>
          <button
            onClick={() => onEdit(item)}
            title="Edit"
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
          >
            <Pencil size={13} className="text-muted-foreground hover:text-foreground" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete"
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-40"
          >
            {deleting
              ? <Loader2 size={13} className="animate-spin text-muted-foreground" />
              : <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
            }
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const Announcements = () => {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['announcements'],
    queryFn: fetchAnnouncements,
    staleTime: 60_000,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (a: Announcement) => { setEditing(a); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const handleSaved = (saved: Announcement) => {
    queryClient.setQueryData<Announcement[]>(['announcements'], (old) => {
      if (!old) return [saved];
      const exists = old.some((a) => a.id === saved.id);
      return exists
        ? old.map((a) => (a.id === saved.id ? saved : a))
        : [saved, ...old];
    });
    closeModal();
  };

  const handleToggle = (updated: Announcement) => {
    queryClient.setQueryData<Announcement[]>(['announcements'], (old) =>
      old ? old.map((a) => (a.id === updated.id ? updated : a)) : old
    );
  };

  const handleDelete = (deleted: Announcement) => {
    queryClient.setQueryData<Announcement[]>(['announcements'], (old) =>
      old ? old.filter((a) => a.id !== deleted.id) : old
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id || !data) return;

    const oldIndex = data.findIndex((a) => a.id === active.id);
    const newIndex = data.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(data, oldIndex, newIndex);
    const withNewOrders = reordered.map((a, i) => ({ ...a, display_order: (i + 1) * 10 }));

    queryClient.setQueryData<Announcement[]>(['announcements'], withNewOrders);

    const changed = withNewOrders.filter((a, i) => a.display_order !== data[i]?.display_order);
    try {
      await Promise.all(
        changed.map((a) => updateAnnouncement(a.id, { display_order: a.display_order }))
      );
    } catch (err) {
      console.error('Failed to save order:', err);
      toast.error('Failed to save new order.');
      queryClient.setQueryData<Announcement[]>(['announcements'], data);
    }
  };

  const activeItem = activeId ? (data ?? []).find((a) => a.id === activeId) : null;

  // Callback ref to avoid stale closures
  const handleSavedCallback = useCallback(handleSaved, [queryClient]);

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 pt-14 md:pt-0">
        {/* ── Header ── */}
        <div className="px-4 sm:px-8 pt-4 sm:pt-8 pb-5 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                Announcements
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {data
                  ? `${data.filter((a) => a.is_active).length} active · ${data.filter((a) => !a.is_active).length} inactive · drag to reorder`
                  : 'Manage app announcements'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="gap-2"
              >
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={openNew}
                className="gap-2"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
                <Plus size={14} />
                New Announcement
              </Button>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="px-4 sm:px-8 py-6 flex-1 max-w-3xl">
          {isLoading && (
            <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Loading announcements…</span>
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive">
              <AlertCircle size={16} />
              Failed to load announcements. Try refreshing.
            </div>
          )}

          {!isLoading && !isError && data && (
            data.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
                <Bell size={32} className="opacity-30" />
                <p className="text-sm">No announcements yet.</p>
                <Button size="sm" onClick={openNew} variant="outline" className="gap-2">
                  <Plus size={13} /> Create first announcement
                </Button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={data.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {data.map((a) => (
                      <AnnouncementCard
                        key={a.id}
                        item={a}
                        onEdit={openEdit}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </SortableContext>

                <DragOverlay>
                  {activeItem && (
                    <AnnouncementCard
                      item={activeItem}
                      onEdit={() => {}}
                      onToggle={() => {}}
                      onDelete={() => {}}
                      isDragOverlay
                    />
                  )}
                </DragOverlay>
              </DndContext>
            )
          )}
        </div>
      </main>

      <AnnouncementModal
        open={modalOpen}
        item={editing}
        onClose={closeModal}
        onSaved={handleSavedCallback}
      />
    </div>
  );
};

export default Announcements;
