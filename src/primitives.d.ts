/**
 * Ambient types for @deepseek-ai/dsh-client-ui-primitives — provided at
 * runtime by the host's frozen platform module table.
 */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'

  export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'
  export function Button(props: {
    variant?: ButtonVariant
    size?: 'md' | 'sm'
    icon?: ReactNode
    className?: string | undefined
    children?: ReactNode
  } & ButtonHTMLAttributes<HTMLButtonElement>): ReactElement

  export interface MenuItem {
    id: string
    label: ReactNode
    disabled?: boolean
    icon?: ReactNode
    danger?: boolean
    submenu?: readonly MenuItem[]
  }
  export interface MenuSeparator { type: 'separator'; id: string }
  export interface MenuLabel { type: 'label'; id: string; text: string }
  export type MenuEntry = MenuItem | MenuSeparator | MenuLabel

  export function Menu(props: {
    open: boolean
    anchor: ReactNode
    items: readonly MenuEntry[]
    footer?: readonly MenuEntry[]
    selectedId?: string | undefined
    selectedIds?: readonly string[] | undefined
    onSelect: (id: string) => void
    onClose: () => void
    align?: 'start' | 'end'
    side?: 'bottom' | 'top' | 'right'
    portal?: boolean
    closeOnPointerLeave?: boolean
    dense?: boolean
    compact?: boolean
    className?: string
    listClassName?: string
  }): ReactElement

  import type { InputHTMLAttributes } from 'react'
  export function Input(props: {
    icon?: ReactNode
    className?: string
    allowClear?: boolean
    onPressEnter?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  } & InputHTMLAttributes<HTMLInputElement>): ReactElement

  export interface SegmentedTab<Value extends string = string> {
    value: Value
    label: ReactNode
    id: string
    panelId: string
  }
  export function SegmentedTabs<Value extends string>(props: {
    items: readonly SegmentedTab<Value>[]
    value: Value
    onChange: (value: Value) => void
    label: string
    className?: string
  }): ReactElement

  export function Switch(props: {
    checked: boolean
    onChange: (next: boolean) => void
    label?: string
    disabled?: boolean
    title?: string | undefined
    className?: string | undefined
  }): ReactElement

  export function Modal(props: {
    open?: boolean
    onClose?: () => void
    title?: ReactNode
    closeLabel?: string
    description?: string
    children?: ReactNode
    footer?: ReactNode
    className?: string
    contentClassName?: string
    headless?: boolean
    backdropBlur?: boolean
  }): ReactElement | null
}
