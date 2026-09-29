import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminQueueTab } from "@/components/mobile/admin/AdminQueueTab";
import type { QueueItem } from "@/types";

const song = (id: string) =>
  ({
    id,
    status: "pending",
    addedBy: "Alice",
    mediaItem: {
      id: `m-${id}`,
      title: `Song ${id}`,
      artist: "A",
      duration: 90,
    },
  }) as unknown as QueueItem;

describe("AdminQueueTab", () => {
  it("moves songs up and down", () => {
    const onReorderQueue = vi.fn();
    render(
      <AdminQueueTab
        pendingQueue={[song("a"), song("b"), song("c")]}
        onReorderQueue={onReorderQueue}
      />
    );
    const up = screen.getAllByTestId("admin-move-up");
    const down = screen.getAllByTestId("admin-move-down");
    expect(up[0]).toBeDisabled();
    expect(down[2]).toBeDisabled();

    fireEvent.click(up[2]);
    expect(onReorderQueue).toHaveBeenLastCalledWith("c", 1);
    fireEvent.click(down[0]);
    expect(onReorderQueue).toHaveBeenLastCalledWith("a", 1);
  });

  it("hides the move buttons without a reorder handler", () => {
    render(<AdminQueueTab pendingQueue={[song("a")]} />);
    expect(screen.queryByTestId("admin-move-up")).toBeNull();
  });
});
