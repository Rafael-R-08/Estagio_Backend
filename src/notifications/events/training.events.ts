export class TrainingCompletedEvent {
  constructor(
    public readonly trainingId: string,
    public readonly userId: string,
    public readonly title: string,
    public readonly completedAt: Date,
  ) {}
}

export class TrainingCreatedEvent {
  constructor(
    public readonly trainingId: string,
    public readonly userId: string,
    public readonly title: string,
  ) {}
}
