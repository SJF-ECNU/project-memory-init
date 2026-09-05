import { Plugin } from "obsidian";
import {
  MEMORY_CONSTELLATION_VIEW,
  MemoryConstellationView,
} from "./constellation-view";

export default class MemoryConstellationPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(
      MEMORY_CONSTELLATION_VIEW,
      (leaf) => new MemoryConstellationView(leaf),
    );

    this.addRibbonIcon("sparkles", "打开记忆星图", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-memory-constellation",
      name: "打开记忆星图",
      callback: () => {
        void this.activateView();
      },
    });
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(MEMORY_CONSTELLATION_VIEW);
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(MEMORY_CONSTELLATION_VIEW)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: MEMORY_CONSTELLATION_VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
