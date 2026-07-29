fetch('./../datos/glosario.yaml')
    .then(response => response.text())
    .then(yamlText => {
        const data = jsyaml.load(yamlText);
        const container = document.querySelector('#divGlosario');
        container.innerHTML = '';
        data.glosario.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'glosario-item';
            itemDiv.innerHTML = `<h2>${item.termino}</h2><p>${item.definicion}</p>`;
            container.appendChild(itemDiv);
        });
    })
    .catch(error => console.error('Error al cargar el YAML:', error));
