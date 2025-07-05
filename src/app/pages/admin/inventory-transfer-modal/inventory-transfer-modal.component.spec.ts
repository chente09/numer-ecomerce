import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryTransferModalComponent } from './inventory-transfer-modal.component';

describe('InventoryTransferModalComponent', () => {
  let component: InventoryTransferModalComponent;
  let fixture: ComponentFixture<InventoryTransferModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryTransferModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InventoryTransferModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
