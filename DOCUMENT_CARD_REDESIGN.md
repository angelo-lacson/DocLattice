# Document Cards Redesign

## Overview
Modern redesign of document cards with improved mobile and desktop experience.

## Changes Made

### 1. New Components
- **`ModernDocumentItem.tsx`**: New component with two view modes:
  - **Card View**: Compact cards (200px tall vs 280-360px)
  - **List View**: Mobile-optimized list items (~80px tall)
  - **Context Menu**: Right-click & long-press support with modern styled menu

- **`ModernContextMenu.tsx`**: Sleek context menu component
  - Right-click support (desktop)
  - Long-press support (mobile, 500ms)
  - Auto-positioning to stay on screen
  - Smooth animations and transitions
  - Haptic feedback on mobile
  - Custom styled (no Semantic UI dependency)

### 2. Updated Components

#### `DocumentCards.tsx`
- Added support for three view modes:
  - `classic`: Original DocumentItem (backward compatible)
  - `modern-card`: New compact card design
  - `modern-list`: Mobile-friendly list view
- Added responsive grid containers for each view mode
- Default: `modern-card`

#### `CorpusDocumentCards.tsx`
- Updated view toggle with three options:
  - Card View (grid layout icon)
  - List View (list icon)
  - Table View (table icon - existing metadata grid)
- Responsive defaults:
  - Mobile (≤768px): List view
  - Desktop: Card view
- Improved toggle button styling with active states

## Key Improvements

### Mobile Experience
- **List View**:
  - 56x56px thumbnails instead of 140px tall images
  - ~80px item height vs 280-360px
  - All actions visible (no hover required)
  - Much better information density
  - Swipe-friendly layout
- **Context Menu**:
  - Long-press (500ms) to open
  - Visual feedback during long-press
  - Haptic vibration on menu open
  - Auto-adjusts position to stay on screen
  - Tap outside to close

### Desktop Experience
- **Card View**:
  - Smaller, more efficient cards (200px vs 280-360px)
  - 4-5 cards per row vs 3-4
  - Better hover states with overlay actions
  - Cleaner, more modern aesthetic
  - Improved grid spacing
- **Context Menu**:
  - Right-click to open
  - Smooth slide-in animation
  - Auto-positioning (stays within viewport)
  - Keyboard support (Esc to close)
  - Click outside to dismiss

### Design Updates
- Modern color palette (slate grays, blue accents)
- Smooth transitions and hover effects
- Better typography and spacing
- Consistent 8px design system
- Improved accessibility (focus states, contrast)

## Technical Details

### Context Menu Actions
The context menu provides quick access to all document actions:
- **Open Document** (primary action)
- **View Details**
- **Download PDF** (if available)
- **Edit Document** (if user has permission)
- **Remove from Corpus** (if in corpus view)
- **Select/Deselect** (for batch operations)

Actions are dynamically shown based on:
- Document permissions
- Document type (PDF vs other)
- Current context (corpus vs library)
- Document state (processing, locked, etc.)

### View Modes
```typescript
type ViewMode = "classic" | "modern-card" | "modern-list";
```

### Card View
- Height: 200px (fixed)
- Image: 90px tall
- Content: 110px
- Grid: `repeat(auto-fill, minmax(220px, 1fr))`

### List View
- Height: ~80px (flexible)
- Thumbnail: 56x56px
- Horizontal layout
- Max width: 1200px (centered)

### Performance
- No breaking changes
- Backward compatible with `classic` mode
- Maintains all existing functionality
- Improved render performance with smaller cards

## Usage

### DocumentCards
```tsx
<DocumentCards
  items={items}
  viewMode="modern-list" // or "modern-card" or "classic"
  // ... other props
/>
```

### CorpusDocumentCards
```tsx
// Automatically uses responsive defaults
// Users can toggle between views via UI
<CorpusDocumentCards opened_corpus_id={id} />
```

## Migration

No migration needed! The changes are backward compatible:
- Default is `modern-card` (new design)
- Pass `viewMode="classic"` to use old design
- CorpusDocumentCards automatically adapts to screen size

## Future Enhancements

Potential improvements:
- [ ] Persist view mode preference in localStorage
- [ ] Add keyboard shortcuts for view switching
- [ ] Implement virtual scrolling for very large lists
- [ ] Add drag-to-reorder functionality
- [ ] Custom thumbnail generation for better previews
