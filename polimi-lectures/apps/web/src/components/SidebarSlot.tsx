import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Lets a page put content into the left sidebar (e.g. the lecture's PDF materials).
 * Rendered through a portal, so the content keeps the page's React context (playback state, callbacks).
 */
export interface SidebarSlotValue {
  target: HTMLElement | null;
  collapsed: boolean;
  expand: () => void;
}

export const SidebarSlotContext = createContext<SidebarSlotValue>({ target: null, collapsed: false, expand: () => {} });

export function SidebarSection({ children }: { children: (opts: { collapsed: boolean; expand: () => void }) => ReactNode }) {
  const { target, collapsed, expand } = useContext(SidebarSlotContext);
  return target ? createPortal(children({ collapsed, expand }), target) : null;
}
