type State = {
  players: { name: string; avatarUrl: string; distance: number };
};

export const createGameUi = () => {
  const update = (s: State) => {
    document.body.className = "g";

    // ok fuck this time we can't write on document without erasing the canvas
    // what do you propose agent?
  };
};
