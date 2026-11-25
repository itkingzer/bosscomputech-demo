import { useState, type InputHTMLAttributes } from 'react';

export const normalizePhone = (value: string): string => {
  const text = value.replace(/[๐-๙]/g, digit => String(digit.charCodeAt(0) - '๐'.charCodeAt(0)));
  const local = text.replace(/^\s*(?:\+66|0066)[\s-]*0?/, '0');
  return local.replace(/[^0-9]/g, '').slice(0, 10);
};

type InputProps = InputHTMLAttributes<HTMLInputElement>;
type PhoneInputProps = Omit<InputProps, 'type' | 'value' | 'defaultValue' | 'maxLength'> & {
  value?: string;
  defaultValue?: string;
};

export function PhoneInput({ value, defaultValue, onChange, ...props }: PhoneInputProps) {
  return (
    <input
      placeholder="เช่น 0812345678"
      {...props}
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      pattern="[0-9]{1,10}"
      value={value === undefined ? undefined : normalizePhone(value)}
      defaultValue={defaultValue === undefined ? undefined : normalizePhone(defaultValue)}
      onChange={(event) => {
        event.currentTarget.value = normalizePhone(event.currentTarget.value);
        onChange?.(event);
      }}
    />
  );
}

export function NumberInput({ value, onChange, onBlur, step, ...props }: Omit<InputProps, 'type'>) {
  const [isCleared, setIsCleared] = useState(false);
  const allowsDecimals = step === 'any' || !Number.isInteger(Number(step ?? 1));

  return (
    <input
      {...props}
      type="number"
      inputMode={allowsDecimals ? 'decimal' : 'numeric'}
      step={step}
      value={isCleared ? '' : value}
      onChange={(event) => {
        const input = event.currentTarget;
        if (input.validity.badInput) return;
        const normalized = input.value.replace(/^(-?)0+(?=\d)/, '$1');
        if (input.value !== normalized) input.value = normalized;
        setIsCleared(normalized === '');
        onChange?.(event);
      }}
      onBlur={(event) => {
        setIsCleared(false);
        onBlur?.(event);
      }}
    />
  );
}
