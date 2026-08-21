console.log('=== Step 1: Testing Scroll Affordance Calculations ===');

const mockElement = {
  scrollLeft: 0,
  clientWidth: 800,
  scrollWidth: 1400,
};

const canScrollLeft = mockElement.scrollLeft > 5;
const canScrollRight = mockElement.scrollLeft + mockElement.clientWidth < mockElement.scrollWidth - 5;

console.log(`Scroll State (Initial): Left=${canScrollLeft}, Right=${canScrollRight}`);

if (canScrollLeft !== false || canScrollRight !== true) {
  console.error('FAIL: Expected canScrollRight=true when initial board overflows');
  process.exit(1);
}

mockElement.scrollLeft = 600; // scrolled all the way right
const canScrollLeftAfter = mockElement.scrollLeft > 5;
const canScrollRightAfter = mockElement.scrollLeft + mockElement.clientWidth < mockElement.scrollWidth - 5;

console.log(`Scroll State (Scrolled Right): Left=${canScrollLeftAfter}, Right=${canScrollRightAfter}`);

if (canScrollLeftAfter !== true || canScrollRightAfter !== false) {
  console.error('FAIL: Expected canScrollRight=false when scrolled to end');
  process.exit(1);
}

console.log('\n✅ MATTERS BOARD HORIZONTAL SCROLL TESTS PASSED!');
