// Ініціалізація всіх повзунків До/Після на сторінці
export function initCompareSliders(root = document) {
    const sliders = root.querySelectorAll('.compare-wrapper');

    sliders.forEach(wrapper => {
        const sliderInput = wrapper.querySelector('.slider-range');
        const beforeImage = wrapper.querySelector('.img-before');
        const sliderHandle = wrapper.querySelector('.slider-handle');
        const badgeBefore = wrapper.querySelector('.badge-before');
        const badgeAfter = wrapper.querySelector('.badge-after');

        // Оновлення позиції лінії та обрізки фото при русі повзунка
        sliderInput.addEventListener('input', (e) => {
            const sliderValue = e.target.value;

            // Змінюємо ширину видимої частини "До" фотографії
            beforeImage.style.clipPath = `polygon(0 0, ${sliderValue}% 0, ${sliderValue}% 100%, 0 100%)`;

            // Рухаємо візуальну лінію з кнопкою
            sliderHandle.style.left = `${sliderValue}%`;

            // Ховаємо бейдж, коли лінія наближається до нього
            badgeBefore.style.opacity = sliderValue < 20 ? 0 : 1;
            badgeAfter.style.opacity = sliderValue > 80 ? 0 : 1;
        });
    });
}
