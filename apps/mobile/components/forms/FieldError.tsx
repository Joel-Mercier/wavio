import type { AnyFieldApi } from "@tanstack/react-form";
import AlertCircleIcon from "lucide-react-native/dist/esm/icons/circle-alert.mjs";
import {
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
} from "@/components/ui/form-control";

export function showFieldError(field: AnyFieldApi): boolean {
  return field.state.meta.isBlurred && !field.state.meta.isValid;
}

export function handleFieldBlur(field: AnyFieldApi): void {
  field.handleBlur();
  field.validate("change");
}

interface FieldErrorProps {
  field: AnyFieldApi;
}

export default function FieldError({ field }: FieldErrorProps) {
  if (!showFieldError(field)) return null;
  return (
    <FormControlError className="items-center">
      <FormControlErrorIcon as={AlertCircleIcon} className="text-red-500" />
      <FormControlErrorText className="text-red-500 shrink">
        {field.state.meta.errors.map((error) => error?.message).join("\n")}
      </FormControlErrorText>
    </FormControlError>
  );
}
