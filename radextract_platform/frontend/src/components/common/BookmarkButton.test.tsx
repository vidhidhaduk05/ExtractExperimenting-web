import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BookmarkButton } from "./BookmarkButton";

it("exposes bookmark state and does not select the surrounding study row", () => {
  const toggle = vi.fn();
  const select = vi.fn();
  const { rerender } = render(<div onClick={select}><BookmarkButton saved={false} disabled={false} onClick={toggle} /></div>);
  fireEvent.click(screen.getByRole("button", { name: "Save for later" }));
  expect(toggle).toHaveBeenCalledOnce();
  expect(select).not.toHaveBeenCalled();
  rerender(<BookmarkButton saved={true} disabled={true} onClick={toggle} />);
  const button = screen.getByRole("button", { name: "Remove bookmark" });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button);
  expect(toggle).toHaveBeenCalledOnce();
});
