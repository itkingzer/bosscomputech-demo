import { useRef, type ComponentPropsWithoutRef, type PointerEvent } from 'react';

const keyboardFieldSelector = [
  'textarea',
  'input:is([type="text"], [type="search"], [type="tel"], [type="url"], [type="email"], [type="password"], [type="number"], :not([type]))',
].join(', ');

function getFocusedKeyboardField(event: PointerEvent<HTMLDivElement>) {
  // Use the shorter screen edge so rotation and the on-screen keyboard do not change the classification.
  if (event.pointerType !== 'touch' || Math.min(window.screen.width, window.screen.height) < 600) {
    return null;
  }

  const focused = event.currentTarget.ownerDocument.activeElement;
  if (!(focused instanceof HTMLElement) || focused.inputMode === 'none') return null;
  if (focused.isContentEditable) return focused;
  return focused.matches(keyboardFieldSelector) && !(focused as HTMLInputElement | HTMLTextAreaElement).readOnly
    ? focused
    : null;
}

type ModalBackdropProps = Omit<ComponentPropsWithoutRef<'div'>, 'onClick' | 'onPointerDown' | 'onPointerCancel'> & {
  onDismiss?: () => void;
};

export function ModalBackdrop({ onDismiss, ...props }: ModalBackdropProps) {
  const fieldAtPointerDown = useRef<HTMLElement | null>(null);

  return (
    <div
      {...props}
      onPointerDown={event => {
        // The browser can move focus away from the field before dispatching the click.
        fieldAtPointerDown.current = onDismiss && event.target === event.currentTarget
          ? getFocusedKeyboardField(event)
          : null;
        if (fieldAtPointerDown.current) event.preventDefault();
      }}
      onPointerCancel={() => { fieldAtPointerDown.current = null; }}
      onClick={event => {
        const field = fieldAtPointerDown.current;
        fieldAtPointerDown.current = null;
        if (event.target !== event.currentTarget || !onDismiss) return;
        if (field && event.detail > 0) {
          event.stopPropagation();
          field.blur();
          return;
        }
        onDismiss();
      }}
    />
  );
}
