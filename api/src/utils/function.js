function slugify(text) {
    return text.toLowerCase().replace(/ /g, '-');
  }
  function formatDate(date) {
    return date.toISOString().split('T')[0];
  }
  function formatDateTime(date) {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    const d = new Date(date);
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
  
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    const time = `${hours}:${minutes} ${ampm}`;
  
    return `${day} ${month} ${year} ${time}`;
  }
  function getAgeByDate(date) {
    const today = new Date();
    const birthDate = new Date(date);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }
  module.exports = {
    slugify,
    formatDate,
    formatDateTime,
    getAgeByDate
  };
  